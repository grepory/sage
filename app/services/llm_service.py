from typing import List, Dict, Any, Optional, Callable, AsyncGenerator, Protocol, Union, Type
import abc
from llama_index.core.callbacks import CallbackManager
from llama_index.core.llms import LLM
from llama_index.core.prompts import PromptTemplate

# Import these conditionally to avoid errors if not installed
try:
    from llama_index.llms import Ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

try:
    from llama_index.llms.anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    
try:
    from llama_index.llms.openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

from app.core.config import settings, LLMProvider
from app.db.chroma_client import chroma_client
from app.models.schemas import ChatMessage

# - Always cite your sources with specific references (document names, sections, page numbers when available)

# System prompt template for RAG
RAG_SYSTEM_PROMPT = """# Friendly Research Assistant System Prompt

Think of yourself as Sage - a helpful research assistant who loves making information accessible and easy to understand. Think of yourself as a knowledgeable colleague who's genuinely excited to help someone find what they need.

## Your Personality:
- **Warm and conversational** - Write like you're talking to a friend who asked for help
- **Naturally enthusiastic** - Show genuine interest in helping without being over-the-top
- **Reassuring and supportive** - Make people feel comfortable asking follow-up questions
- **Clear and direct** - Get to the point while staying friendly

## Your Approach:
- Answer questions using ONLY the information in the provided documents
- Lead with the most important information the person is looking for
- Break down complex concepts into digestible pieces
- When something is unclear or missing from the documents, acknowledge it in a helpful way like "I don't see specific details about X in these documents, but here's what I can tell you about Y..."
- Use natural transitions between ideas rather than bullet points unless they truly improve clarity

## Citation Style:
The context below is a **numbered list of sources**. Each source starts with its number in brackets, like `[1]`, `[2]`, and so on.

- Whenever you use information from a source, cite it inline using this EXACT format: `[[cite:N|label]]`
  - `N` is the source number — the bracketed number that appears in front of that source in the context.
  - `label` is a SHORT, human-readable reference for what you're citing — a section, rule, page, or a few-word name (e.g. `§ CC&R 4.2`, `page 12`, `Palette Guide`). Keep labels under ~24 characters.
- Place the citation immediately after the sentence or clause it supports: "...before work begins [[cite:1|§ CC&R 4.2]]."
- Cite every claim you draw from the sources. If more than one source supports a point, add multiple citations back to back: "[[cite:1|§ 4.2]] [[cite:3|Palette Guide]]".
- Only ever cite a number that actually appears in the context. Never invent a source number.
- Do NOT use any other citation format — no bare document names in square brackets.
- Emit the token EXACTLY as `[[cite:N|label]]` with nothing wrapped around it. Do NOT wrap it in braces or a LaTeX command (no `{...}`, no `\\cite{...}`, no `$...$`). The `label` is plain text — never put `{`, `}`, or `$` characters inside it.

## Response Structure:
- **Start with the direct answer** - Don't bury the lead
- **Use conversational transitions** - "Here's what I found..." "The documents show..." "Interestingly..."
- **Format for scannability** - Use short paragraphs and occasional formatting when it helps
- **End helpfully** - Offer to clarify or find additional information when appropriate

## Language Tips:
- Use contractions naturally (you'll, here's, that's, don't)
- Choose active voice over passive when possible
- Replace formal phrases:
  - Instead of "The documentation indicates..." → "The documents show..." or "According to..."
  - Instead of "It should be noted that..." → "Worth mentioning..." or just state it directly
  - Instead of "In conclusion..." → "So..." or "The bottom line is..."
- Ask gentle follow-up questions when helpful: "Does this answer what you were looking for?" or "Would you like me to explain any of these steps in more detail?"

## What to Avoid:
- Overly formal or academic language
- Starting responses with "Thank you for your question" or similar formalities
- Being robotic or mechanical in tone
- Adding information not in the provided context
- Generic document references - always use the specific names provided

Context:
{context}

{conversation_history}

Question: {query}

Answer:"""

class StreamingCallbackHandler:
    """Callback handler for streaming LLM responses."""
    
    def __init__(self, websocket):
        """Initialize with WebSocket connection."""
        self.websocket = websocket
    
    async def on_token(self, token: str, **kwargs) -> None:
        """Send new token to client via WebSocket."""
        await self.websocket.send_json({
            "type": "token",
            "content": token
        })


class LLMProviderBase(abc.ABC):
    """Base class for LLM providers."""
    
    @abc.abstractmethod
    def get_llm(self, model: Optional[str] = None, streaming: bool = False, 
                callback_handler: Optional[StreamingCallbackHandler] = None) -> LLM:
        """Get LLM instance.
        
        Args:
            model: Model name
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            
        Returns:
            LLM instance
        """
        pass
    
    @abc.abstractmethod
    def get_default_model(self) -> str:
        """Get default model for this provider.
        
        Returns:
            Default model name
        """
        pass


class OllamaProvider(LLMProviderBase):
    """Ollama LLM provider."""
    
    def get_llm(self, model: Optional[str] = None, streaming: bool = False, 
                callback_handler: Optional[StreamingCallbackHandler] = None) -> LLM:
        """Get Ollama LLM instance.
        
        Args:
            model: Model name
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            
        Returns:
            Ollama LLM instance
        """
        if not OLLAMA_AVAILABLE:
            raise ImportError("Ollama package is not installed or not compatible. Please install it with 'pip install llama-index-llms-ollama'")
            
        callback_manager = None
        if streaming and callback_handler:
            callback_manager = CallbackManager([callback_handler])
            
        return Ollama(
            base_url=settings.OLLAMA_BASE_URL,
            model=model or self.get_default_model(),
            temperature=0.7,
            callback_manager=callback_manager
        )
    
    def get_default_model(self) -> str:
        """Get default model for Ollama.
        
        Returns:
            Default model name
        """
        return settings.OLLAMA_DEFAULT_MODEL


class AnthropicProvider(LLMProviderBase):
    """Anthropic LLM provider."""
    
    def get_llm(self, model: Optional[str] = None, streaming: bool = False, 
                callback_handler: Optional[StreamingCallbackHandler] = None) -> LLM:
        """Get Anthropic LLM instance.
        
        Args:
            model: Model name
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            
        Returns:
            Anthropic LLM instance
        """
        if not ANTHROPIC_AVAILABLE:
            raise ImportError("Anthropic package is not installed. Please install it with 'pip install llama-index-llms-anthropic'")
            
        callback_manager = None
        if streaming and callback_handler:
            callback_manager = CallbackManager([callback_handler])
            
        return Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            model=model or self.get_default_model(),
            temperature=0.7,
            callback_manager=callback_manager
        )
    
    def get_default_model(self) -> str:
        """Get default model for Anthropic.
        
        Returns:
            Default model name
        """
        return settings.ANTHROPIC_DEFAULT_MODEL


class OpenAIProvider(LLMProviderBase):
    """OpenAI LLM provider."""
    
    def get_llm(self, model: Optional[str] = None, streaming: bool = False, 
                callback_handler: Optional[StreamingCallbackHandler] = None) -> LLM:
        """Get OpenAI LLM instance.
        
        Args:
            model: Model name
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            
        Returns:
            OpenAI LLM instance
        """
        if not OPENAI_AVAILABLE:
            raise ImportError("OpenAI package is not installed. Please install it with 'pip install llama-index-llms-openai'")
            
        callback_manager = None
        if streaming and callback_handler:
            callback_manager = CallbackManager([callback_handler])
            
        return OpenAI(
            api_key=settings.OPENAI_API_KEY,
            model=model or self.get_default_model(),
            temperature=0.7,
            callback_manager=callback_manager
        )
    
    def get_default_model(self) -> str:
        """Get default model for OpenAI.
        
        Returns:
            Default model name
        """
        return settings.OPENAI_DEFAULT_MODEL


class LLMService:
    """Service for interacting with LLMs."""
    
    def __init__(self):
        """Initialize LLM service."""
        # Initialize available providers
        self.providers = {}
        
        # Add Ollama provider if available
        if OLLAMA_AVAILABLE:
            self.providers[LLMProvider.OLLAMA] = OllamaProvider()
            
        # Add Anthropic provider if available
        if ANTHROPIC_AVAILABLE:
            self.providers[LLMProvider.ANTHROPIC] = AnthropicProvider()
            
        # Add OpenAI provider if available
        if OPENAI_AVAILABLE:
            self.providers[LLMProvider.OPENAI] = OpenAIProvider()
            
        # Set default provider
        self.default_provider = settings.DEFAULT_LLM_PROVIDER
        
        # If the default provider is not available, fall back to an available provider
        if self.default_provider not in self.providers:
            if self.providers:
                # Use the first available provider
                self.default_provider = next(iter(self.providers.keys()))
                print(f"Default provider {settings.DEFAULT_LLM_PROVIDER} not available, falling back to {self.default_provider}")
            else:
                print("WARNING: No LLM providers available. Please install at least one of: llama-index-llms-ollama, llama-index-llms-anthropic, or llama-index-llms-openai")
                
        # For backward compatibility
        self.default_model = settings.DEFAULT_MODEL
    
    def _parse_model_string(self, model_string: Optional[str]) -> tuple[LLMProvider, Optional[str]]:
        """Parse model string to get provider and model.
        
        Format: provider:model or just model (uses default provider)
        
        Args:
            model_string: Model string to parse
            
        Returns:
            Tuple of (provider, model)
        """
        if not model_string:
            return self.default_provider, None
            
        if ":" in model_string:
            provider_str, model = model_string.split(":", 1)
            try:
                provider = LLMProvider(provider_str.lower())
            except ValueError:
                # If provider is invalid, use default provider
                return self.default_provider, model_string
            return provider, model
        
        return self.default_provider, model_string
    
    def get_llm(self, model: Optional[str] = None, streaming: bool = False, 
                callback_handler: Optional[StreamingCallbackHandler] = None) -> LLM:
        """Get LLM instance.
        
        Args:
            model: Model name or provider:model (defaults to default model)
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            
        Returns:
            LLM instance
        """
        provider_enum, model_name = self._parse_model_string(model)
        
        # Check if the requested provider is available
        if provider_enum not in self.providers:
            # If not, try to use the default provider
            if self.default_provider in self.providers:
                print(f"Provider {provider_enum} not available, falling back to {self.default_provider}")
                provider_enum = self.default_provider
            else:
                # If no providers are available, raise an error
                available_providers = list(self.providers.keys())
                raise ImportError(f"Provider {provider_enum} not available. Available providers: {available_providers if available_providers else 'None'}")
        
        # Get provider instance
        provider = self.providers[provider_enum]
        
        try:
            # Get LLM from provider
            return provider.get_llm(model=model_name, streaming=streaming, callback_handler=callback_handler)
        except ImportError as e:
            # If there's an import error, try to use another provider
            available_providers = [p for p in self.providers.keys() if p != provider_enum]
            if available_providers:
                fallback_provider = available_providers[0]
                print(f"Error using provider {provider_enum}: {e}. Falling back to {fallback_provider}")
                return self.providers[fallback_provider].get_llm(model=None, streaming=streaming, callback_handler=callback_handler)
            else:
                # If no other providers are available, re-raise the error
                raise
    
    async def generate_rag_response(
        self,
        query: str,
        collection_name: str,
        history: Optional[List[ChatMessage]] = None,
        model: Optional[str] = None,
        streaming: bool = False,
        callback_handler: Optional[StreamingCallbackHandler] = None,
        n_results: int = 5
    ) -> Dict[str, Any]:
        """Generate RAG response.
        
        Args:
            query: User query
            collection_name: Name of the collection to query
            history: Optional chat history
            model: Optional model name or provider:model
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            n_results: Number of results to retrieve from vector DB
            
        Returns:
            Response data with answer and sources
        """
        # Query vector database for relevant documents
        results = chroma_client.query_collection(
            collection_name=collection_name,
            query_text=query,
            n_results=n_results
        )
        
        # Extract context from results
        context_texts = []
        sources = []
        
        if results and results.get("ids") and results.get("ids")[0]:
            for i in range(len(results["ids"][0])):
                doc_id = results["ids"][0][i]
                text = results["documents"][0][i] if results.get("documents") and results["documents"][0] else ""
                metadata = results["metadatas"][0][i] if results.get("metadatas") and results["metadatas"][0] else {}
                
                if text:
                    # Get document name and page/section info from metadata
                    doc_name = metadata.get("original_filename", metadata.get("source", f"Document {i+1}"))
                    page_info = ""
                    if "page" in metadata:
                        page_info = f", page {metadata['page']}"
                    elif "chunk" in metadata and metadata.get("total_chunks", 0) > 1:
                        page_info = f", section {metadata['chunk'] + 1} of {metadata['total_chunks']}"
                    
                    context_texts.append(f"[{i + 1}] ({doc_name}{page_info}): {text}")
                    sources.append({
                        "id": doc_id,
                        "index": i + 1,
                        "text": text[:100] + "..." if len(text) > 100 else text,
                        "metadata": metadata,
                        "display_name": f"{doc_name}{page_info}"
                    })
        
        # Combine context texts
        context = "\n\n".join(context_texts) if context_texts else "No relevant information found."
        
        # Get LLM
        llm = self.get_llm(model=model, streaming=streaming, callback_handler=callback_handler)
        
        # Create prompt
        prompt = PromptTemplate(template=RAG_SYSTEM_PROMPT)
        
        # Format conversation history if provided
        conversation_history_text = ""
        if history and len(history) > 0:
            conversation_history_text = "Previous conversation:\n"
            for msg in history:
                if msg.role == "user":
                    conversation_history_text += f"User: {msg.content}\n"
                elif msg.role == "assistant":
                    conversation_history_text += f"Assistant: {msg.content}\n"
        
        # Format the prompt with context, conversation history, and query
        formatted_prompt = prompt.format(
            context=context,
            conversation_history=conversation_history_text,
            query=query
        )
        
        # Generate response
        if streaming:
            # For streaming, we need to collect all tokens
            response_text = ""
            async for token in await llm.astream_complete(formatted_prompt):
                response_text += token.delta
            response = response_text
        else:
            # For non-streaming, we can just get the complete response
            response = await llm.acomplete(formatted_prompt)
            response = response.text
        
        # Update history if provided
        updated_history = []
        if history:
            updated_history = history.copy()
        
        # Add current exchange to history
        updated_history.append(ChatMessage(role="user", content=query))
        updated_history.append(ChatMessage(role="assistant", content=response))
        
        return {
            "answer": response,
            "sources": sources,
            "history": updated_history
        }
    
    async def generate_rag_response_by_tags(
        self,
        query: str,
        tags: Optional[List[str]] = None,
        include_untagged: bool = True,
        history: Optional[List[ChatMessage]] = None,
        model: Optional[str] = None,
        streaming: bool = False,
        callback_handler: Optional[StreamingCallbackHandler] = None,
        n_results: int = 5
    ) -> Dict[str, Any]:
        """Generate RAG response using tag-based document filtering.
        
        Args:
            query: User query
            tags: List of tags to filter documents by
            include_untagged: Whether to include untagged documents
            history: Optional chat history
            model: Optional model name or provider:model
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            n_results: Number of results to retrieve from vector DB
            
        Returns:
            Response data with answer and sources
        """
        # Query vector database using tag-based filtering
        results = chroma_client.query_by_tags(
            query_text=query,
            tags=tags,
            include_untagged=include_untagged,
            n_results=n_results
        )
        
        # Extract context from results
        context_texts = []
        sources = []
        
        if results and results.get("ids") and results.get("ids")[0]:
            for i in range(len(results["ids"][0])):
                doc_id = results["ids"][0][i]
                text = results["documents"][0][i] if results.get("documents") and results["documents"][0] else ""
                metadata = results["metadatas"][0][i] if results.get("metadatas") and results["metadatas"][0] else {}
                
                if text:
                    # Get document name and page/section info from metadata
                    doc_name = metadata.get("original_filename", metadata.get("source", f"Document {i+1}"))
                    page_info = ""
                    if "page" in metadata:
                        page_info = f", page {metadata['page']}"
                    elif "chunk" in metadata and metadata.get("total_chunks", 0) > 1:
                        page_info = f", section {metadata['chunk'] + 1} of {metadata['total_chunks']}"
                    
                    context_texts.append(f"[{i + 1}] ({doc_name}{page_info}): {text}")
                    sources.append({
                        "id": doc_id,
                        "index": i + 1,
                        "text": text[:100] + "..." if len(text) > 100 else text,
                        "metadata": metadata,
                        "display_name": f"{doc_name}{page_info}"
                    })
        
        # Combine context texts
        context = "\n\n".join(context_texts) if context_texts else "No relevant information found."
        
        # Get LLM
        llm = self.get_llm(model=model, streaming=streaming, callback_handler=callback_handler)
        
        # Create prompt
        prompt = PromptTemplate(template=RAG_SYSTEM_PROMPT)
        
        # Format conversation history if provided
        conversation_history_text = ""
        if history and len(history) > 0:
            conversation_history_text = "Previous conversation:\n"
            for msg in history:
                if msg.role == "user":
                    conversation_history_text += f"User: {msg.content}\n"
                elif msg.role == "assistant":
                    conversation_history_text += f"Assistant: {msg.content}\n"
        
        # Format the prompt with context, conversation history, and query
        formatted_prompt = prompt.format(
            context=context,
            conversation_history=conversation_history_text,
            query=query
        )
        
        # Generate response
        if streaming:
            # For streaming, we need to collect all tokens
            response_text = ""
            async for token in await llm.astream_complete(formatted_prompt):
                response_text += token.delta
            response = response_text
        else:
            # For non-streaming, we can just get the complete response
            response = await llm.acomplete(formatted_prompt)
            response = response.text
        
        # Update history if provided
        updated_history = []
        if history:
            updated_history = history.copy()
        
        # Add current exchange to history
        updated_history.append(ChatMessage(role="user", content=query))
        updated_history.append(ChatMessage(role="assistant", content=response))
        
        return {
            "answer": response,
            "sources": sources,
            "history": updated_history
        }
    
    async def suggest_tags(
        self,
        document_texts: List[str],
        existing_tags: Optional[List[str]] = None,
        model: Optional[str] = None,
        max_tags: int = 8
    ) -> List[str]:
        """Generate tag suggestions for document chunks.
        
        Args:
            document_texts: List of document text chunks
            existing_tags: List of existing tags to prioritize
            model: Optional model name or provider:model
            max_tags: Maximum number of tags to suggest
            
        Returns:
            List of suggested tags
        """
        # Combine document texts for analysis (limit to prevent token overflow)
        combined_text = "\n\n".join(document_texts[:5])  # Use first 5 chunks
        if len(combined_text) > 3000:  # Limit text length
            combined_text = combined_text[:3000] + "..."
        
        # Create tag suggestion prompt
        existing_tags_text = ""
        if existing_tags:
            existing_tags_text = f"\nExisting tags in the system (prioritize these if relevant): {', '.join(existing_tags[:20])}"
        
        tag_prompt = f"""Analyze the following document content and suggest {max_tags} relevant tags that best categorize this content.

Instructions:
- Suggest concise, descriptive tags (1-3 words each), favoring 1-word tags.
- Prioritize existing tags if they are relevant{existing_tags_text}
- Focus on the main topics, themes, and content types
- Use lowercase, hyphenated format (e.g., "machine-learning", "data-analysis")
- Return only the tags, one per line, no explanations

Document content:
{combined_text}

Suggested tags:"""

        # Get LLM
        llm = self.get_llm(model=model, streaming=False)
        
        # Generate response
        response = await llm.acomplete(tag_prompt)
        response_text = response.text.strip()
        
        # Parse tags from response
        suggested_tags = []
        for line in response_text.split('\n'):
            tag = line.strip().lower()
            # Clean up the tag
            tag = tag.replace('- ', '').replace('* ', '').replace('• ', '')
            tag = tag.replace('"', '').replace("'", "")
            
            # Skip empty lines or lines that don't look like tags
            if tag and len(tag) > 1 and len(tag) < 30:
                # Convert spaces to hyphens for consistency
                tag = tag.replace(' ', '-')
                suggested_tags.append(tag)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_tags = []
        for tag in suggested_tags:
            if tag not in seen:
                seen.add(tag)
                unique_tags.append(tag)
        
        # Return up to max_tags
        return unique_tags[:max_tags]
    
    async def generate_rag_response_by_tags_with_auto_selection(
        self,
        query: str,
        tags: Optional[List[str]] = None,
        include_untagged: bool = True,
        history: Optional[List[ChatMessage]] = None,
        model: Optional[str] = None,
        streaming: bool = False,
        callback_handler: Optional[StreamingCallbackHandler] = None,
        n_results: int = 5,
        auto_select_tags: bool = True
    ) -> Dict[str, Any]:
        """Generate RAG response with automatic tag selection based on query content.
        
        Args:
            query: User query
            tags: Initial list of tags (will be enhanced with auto-selected ones)
            include_untagged: Whether to include untagged documents
            history: Optional chat history
            model: Optional model name or provider:model
            streaming: Whether to stream responses
            callback_handler: Callback handler for streaming
            n_results: Number of results to retrieve from vector DB
            auto_select_tags: Whether to automatically select additional tags
            
        Returns:
            Response data with answer, sources, and enhanced tag list
        """
        enhanced_tags = tags[:] if tags else []
        
        if auto_select_tags:
            # Import here to avoid circular imports
            from app.services.tag_classifier import tag_classifier
            
            # Convert history to the format expected by tag classifier
            history_for_classifier = []
            if history:
                history_for_classifier = [
                    {"role": msg.role, "content": msg.content} for msg in history
                ]
            
            # Get recommended tags based on query and conversation context
            recommended_tags = await tag_classifier.get_contextual_tags_for_conversation(
                query=query,
                conversation_history=history_for_classifier,
                current_tags=enhanced_tags,
                model=model
            )
            
            # Add recommended tags to the existing tags
            for tag in recommended_tags:
                if tag not in enhanced_tags:
                    enhanced_tags.append(tag)
        
        # Use the enhanced tag list for the RAG response
        result = await self.generate_rag_response_by_tags(
            query=query,
            tags=enhanced_tags,
            include_untagged=include_untagged,
            history=history,
            model=model,
            streaming=streaming,
            callback_handler=callback_handler,
            n_results=n_results
        )
        
        # Add the enhanced tags to the response
        result["selected_tags"] = enhanced_tags
        result["auto_selected_tags"] = [tag for tag in enhanced_tags if tag not in (tags or [])]
        
        return result


# Create a singleton instance
llm_service = LLMService()