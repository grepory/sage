from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from typing import List, Dict, Any, Optional
import json

from app.models.schemas import ChatRequest, ChatResponse, ChatMessage, ConversationCreate, ConversationUpdate
from app.db.chroma_client import chroma_client
from app.db.conversation_store import conversation_store
from app.services.llm_service import llm_service, StreamingCallbackHandler
from app.api.routes.conversations import generate_title_from_messages

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for chat functionality.
    
    Args:
        websocket: WebSocket connection
    """
    await websocket.accept()
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            
            try:
                # Parse message
                message = json.loads(data)
                
                # Check message type
                if message.get("type") == "chat":
                    # Extract chat request
                    collection_name = message.get("collection_name")  # Deprecated
                    query = message.get("query")
                    history_data = message.get("history", [])
                    model = message.get("model")
                    conversation_id = message.get("conversation_id")
                    tags = message.get("tags")
                    include_untagged = message.get("include_untagged", True)
                    
                    # Validate required fields
                    if not query:
                        await websocket.send_json({
                            "type": "error",
                            "content": "Missing required field: query"
                        })
                        continue
                    
                    # Initialize history
                    history = None
                    
                    # If conversation_id is provided, load the existing conversation
                    if conversation_id:
                        conversation = conversation_store.get_conversation(conversation_id)
                        if not conversation:
                            await websocket.send_json({
                                "type": "error",
                                "content": f"Conversation {conversation_id} not found"
                            })
                            continue
                        # Use the conversation's history if no history is provided
                        if not history_data:
                            history = conversation.messages
                    
                    # If no history from conversation, use provided history
                    if not history:
                        # Convert history data to ChatMessage objects
                        history = [
                            ChatMessage(role=msg.get("role"), content=msg.get("content"))
                            for msg in history_data
                            if msg.get("role") and msg.get("content")
                        ] if history_data else None
                    
                    # Create streaming callback handler
                    callback_handler = StreamingCallbackHandler(websocket)
                    
                    # Send start message
                    await websocket.send_json({
                        "type": "start",
                        "content": "Generating response..."
                    })
                    
                    # Generate RAG response with automatic tag selection and streaming
                    response_data = await llm_service.generate_rag_response_by_tags_with_auto_selection(
                        query=query,
                        tags=tags,
                        include_untagged=include_untagged,
                        history=history,
                        model=model,
                        streaming=True,
                        callback_handler=callback_handler,
                        auto_select_tags=True
                    )
                    
                    # Save or update the conversation
                    updated_history = response_data["history"]
                    enhanced_tags = response_data.get("selected_tags", tags)
                    
                    if conversation_id:
                        # Update existing conversation with enhanced tags
                        conversation_store.update_conversation(
                            conversation_id,
                            update=ConversationUpdate(
                                messages=updated_history,
                                tags=enhanced_tags
                            )
                        )
                    else:
                        # Create a new conversation with enhanced tags
                        new_conversation = ConversationCreate(
                            collection_name=None,  # Deprecated
                            model=model,
                            messages=updated_history,
                            tags=enhanced_tags,
                            include_untagged=include_untagged
                        )
                        
                        # Generate a title for the new conversation
                        if len(updated_history) >= 2:  # At least one exchange (user + assistant)
                            title = await generate_title_from_messages(updated_history, model)
                            new_conversation.title = title
                        
                        # Save the new conversation
                        saved_conversation = conversation_store.create_conversation(new_conversation)
                        conversation_id = saved_conversation.id
                    
                    # Send complete response
                    await websocket.send_json({
                        "type": "complete",
                        "content": {
                            "answer": response_data["answer"],
                            "sources": response_data["sources"],
                            "history": [
                                {"role": msg.role, "content": msg.content}
                                for msg in response_data["history"]
                            ],
                            "conversation_id": conversation_id,
                            "selected_tags": response_data.get("selected_tags", tags),
                            "auto_selected_tags": response_data.get("auto_selected_tags", [])
                        }
                    })
                
                elif message.get("type") == "ping":
                    # Respond to ping
                    await websocket.send_json({
                        "type": "pong",
                        "content": "pong"
                    })
                
                else:
                    # Unknown message type
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Unknown message type: {message.get('type')}"
                    })
            
            except json.JSONDecodeError:
                # Invalid JSON
                await websocket.send_json({
                    "type": "error",
                    "content": "Invalid JSON message"
                })
            
            except Exception as e:
                # Other errors
                await websocket.send_json({
                    "type": "error",
                    "content": f"Error processing message: {str(e)}"
                })
    
    except WebSocketDisconnect:
        # Client disconnected
        pass


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """REST endpoint for chat functionality.
    
    This is a non-streaming alternative to the WebSocket endpoint.
    
    Args:
        request: Chat request
        
    Returns:
        Chat response
    """
    try:
        # In the new tag-based system, we don't need to check collections
        
        # Initialize history
        history = request.history or []
        conversation_id = request.conversation_id
        
        # If conversation_id is provided, load the existing conversation
        if conversation_id:
            conversation = conversation_store.get_conversation(conversation_id)
            if not conversation:
                raise HTTPException(
                    status_code=404,
                    detail=f"Conversation {conversation_id} not found"
                )
            # Use the conversation's history if no history is provided
            if not request.history:
                history = conversation.messages
        
        # Generate RAG response using automatic tag selection
        response_data = await llm_service.generate_rag_response_by_tags_with_auto_selection(
            query=request.query,
            tags=request.tags,
            include_untagged=request.include_untagged,
            history=history,
            model=request.model,
            auto_select_tags=True
        )
        
        # Save or update the conversation
        updated_history = response_data["history"]
        enhanced_tags = response_data.get("selected_tags", request.tags)
        
        if conversation_id:
            # Update existing conversation with enhanced tags
            conversation_store.update_conversation(
                conversation_id,
                update=ConversationUpdate(
                    messages=updated_history,
                    tags=enhanced_tags
                )
            )
        else:
            # Create a new conversation with enhanced tags
            new_conversation = ConversationCreate(
                collection_name=None,  # Deprecated
                model=request.model,
                messages=updated_history,
                tags=enhanced_tags,
                include_untagged=request.include_untagged
            )
            
            # Generate a title for the new conversation
            if len(updated_history) >= 2:  # At least one exchange (user + assistant)
                title = await generate_title_from_messages(updated_history, request.model)
                new_conversation.title = title
            
            # Save the new conversation
            saved_conversation = conversation_store.create_conversation(new_conversation)
            conversation_id = saved_conversation.id
        
        return ChatResponse(
            answer=response_data["answer"],
            sources=response_data["sources"],
            history=response_data["history"],
            conversation_id=conversation_id,
            selected_tags=response_data.get("selected_tags"),
            auto_selected_tags=response_data.get("auto_selected_tags")
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate response: {str(e)}"
        )