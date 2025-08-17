from typing import List, Dict, Any, Optional
from app.db.chroma_client import chroma_client
from app.services.llm_service import llm_service


class TagClassifier:
    """Service for automatically classifying conversations and selecting relevant tags."""
    
    def __init__(self):
        """Initialize the tag classifier."""
        pass
    
    async def analyze_query_and_select_tags(
        self,
        query: str,
        existing_tags: List[str],
        max_tags: int = 5,
        model: Optional[str] = None
    ) -> List[str]:
        """Analyze a user query and automatically select relevant tags.
        
        Args:
            query: User query to analyze
            existing_tags: List of available tags in the system
            max_tags: Maximum number of tags to select
            model: Optional LLM model to use for analysis
            
        Returns:
            List of selected tag names
        """
        if not existing_tags:
            return []
        
        # Create a prompt for tag classification based on query content
        classification_prompt = f"""You are an expert document classifier. Analyze the following user query and select the most relevant tags from the available tag list.

**Instructions:**
- Select tags that are most relevant to answering the user's question
- Focus on the main topics, concepts, and subject matter in the query
- Consider both direct matches and related concepts
- Select {max_tags} tags maximum
- Only select from the provided tag list
- Return only the tag names, one per line, no explanations

**Available tags:**
{', '.join(existing_tags)}

**User query to analyze:**
{query}

**Selected relevant tags:**"""

        try:
            # Get LLM response
            llm = llm_service.get_llm(model=model, streaming=False)
            response = await llm.acomplete(classification_prompt)
            response_text = response.text.strip()
            
            # Parse the response to extract tag names
            selected_tags = []
            for line in response_text.split('\n'):
                tag = line.strip().lower()
                # Clean up the tag
                tag = tag.replace('- ', '').replace('* ', '').replace('• ', '')
                tag = tag.replace('"', '').replace("'", "")
                
                # Check if this tag exists in our available tags (case-insensitive)
                for existing_tag in existing_tags:
                    if tag and tag.lower() == existing_tag.lower():
                        if existing_tag not in selected_tags:
                            selected_tags.append(existing_tag)
                        break
                
                # Stop if we've reached the maximum
                if len(selected_tags) >= max_tags:
                    break
            
            return selected_tags
            
        except Exception as e:
            print(f"Error in tag classification: {e}")
            # Fallback: try keyword-based matching
            return self._fallback_keyword_matching(query, existing_tags, max_tags)
    
    def _fallback_keyword_matching(
        self,
        query: str,
        existing_tags: List[str],
        max_tags: int
    ) -> List[str]:
        """Fallback keyword-based tag matching when LLM analysis fails.
        
        Args:
            query: User query
            existing_tags: Available tags
            max_tags: Maximum tags to return
            
        Returns:
            List of matched tags
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        # Score tags based on keyword matches
        tag_scores = []
        for tag in existing_tags:
            tag_lower = tag.lower()
            tag_words = set(tag_lower.replace('-', ' ').replace('_', ' ').split())
            
            # Calculate similarity score
            score = 0
            
            # Direct substring match
            if tag_lower in query_lower or any(word in query_lower for word in tag_words):
                score += 2
            
            # Word overlap
            overlap = len(query_words.intersection(tag_words))
            score += overlap
            
            if score > 0:
                tag_scores.append((tag, score))
        
        # Sort by score and return top matches
        tag_scores.sort(key=lambda x: x[1], reverse=True)
        return [tag for tag, _ in tag_scores[:max_tags]]
    
    async def get_contextual_tags_for_conversation(
        self,
        query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        current_tags: Optional[List[str]] = None,
        model: Optional[str] = None
    ) -> List[str]:
        """Get contextually relevant tags for a conversation, considering history.
        
        Args:
            query: Current user query
            conversation_history: Previous messages in conversation
            current_tags: Currently selected tags (will not be removed)
            model: Optional LLM model to use
            
        Returns:
            List of recommended tags to add to the conversation
        """
        # Get all available tags from the system
        all_tags = chroma_client.get_all_tags()
        if not all_tags:
            return []
        
        # Build context from conversation history
        context_text = ""
        if conversation_history:
            context_text = "Previous conversation:\n"
            for msg in conversation_history[-5:]:  # Last 5 messages for context
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                context_text += f"{role.title()}: {content}\n"
            context_text += "\n"
        
        # Combine current query with context
        full_query = context_text + f"Current question: {query}"
        
        # Get tag recommendations
        recommended_tags = await self.analyze_query_and_select_tags(
            full_query, all_tags, max_tags=5, model=model
        )
        
        # Filter out tags that are already selected
        current_tags = current_tags or []
        new_tags = [tag for tag in recommended_tags if tag not in current_tags]
        
        return new_tags
    
    def get_tag_relevance_scores(
        self,
        query: str,
        tags: List[str]
    ) -> Dict[str, float]:
        """Get relevance scores for tags based on query content.
        
        Args:
            query: User query
            tags: List of tags to score
            
        Returns:
            Dictionary mapping tag names to relevance scores (0-1)
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        scores = {}
        for tag in tags:
            tag_lower = tag.lower()
            tag_words = set(tag_lower.replace('-', ' ').replace('_', ' ').split())
            
            score = 0.0
            
            # Direct substring match
            if tag_lower in query_lower:
                score += 0.5
            
            # Word overlap
            if tag_words:
                overlap_ratio = len(query_words.intersection(tag_words)) / len(tag_words)
                score += overlap_ratio * 0.3
            
            # Partial word matches
            for tag_word in tag_words:
                if any(tag_word in query_word or query_word in tag_word for query_word in query_words):
                    score += 0.1
            
            scores[tag] = min(score, 1.0)  # Cap at 1.0
        
        return scores


# Create a singleton instance
tag_classifier = TagClassifier()