"""Anthropic-native web search augmentation.

The main chat path runs through the LlamaIndex ``Anthropic`` wrapper, which does
not expose Anthropic's server-side tools. When the user enables web search on an
Anthropic model, we bypass that wrapper and call the raw ``anthropic`` SDK so we
can declare the built-in ``web_search`` tool. Claude decides per-query whether to
search; results come back with the assistant's answer and are surfaced as
additional sources in the UI.

This module is intentionally self-contained: given a fully-formatted prompt it
returns ``(answer_text, web_sources)`` and streams text deltas to the optional
callback handler. It knows nothing about ChromaDB, tags, or conversation history.
"""

from typing import Any, Dict, List, Optional, Tuple

import anthropic

from app.core.config import settings

# Basic web search tool variant. We deliberately use ``web_search_20250305``
# rather than the newer ``web_search_20260209`` (dynamic filtering) because the
# newer variant is not supported on Claude Haiku 4.5, which is one of the models
# offered in the UI. The basic variant works across every Claude model we ship.
WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 5,
}

# Appended to the RAG prompt so Claude knows the tool exists and stays grounded
# in the retrieved documents first.
WEB_SEARCH_INSTRUCTION = """

## Web Search:
You also have a `web_search` tool. Prefer the numbered document sources above.
Use web search only when those documents do not contain the answer, or when the
question needs current information that would not be in the documents. When you
rely on a web result, name the site or source in your answer so the reader knows
it came from the web rather than the provided documents.
"""


async def generate_web_augmented_response(
    *,
    model: str,
    prompt: str,
    callback_handler: Optional[Any] = None,
    max_tokens: int = 8000,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Run an Anthropic Messages request with the native web_search tool.

    Args:
        model: Bare Anthropic model id (e.g. ``claude-sonnet-5``).
        prompt: Fully-formatted user prompt (RAG context + history + query).
        callback_handler: Optional handler with an async ``on_token`` method;
            text deltas are streamed to it as they arrive.
        max_tokens: Output token ceiling. Streaming is used so large values do
            not risk HTTP timeouts.

    Returns:
        Tuple of ``(answer_text, web_sources)`` where ``web_sources`` is a list
        of ``{"url", "title"}`` dicts for any pages Claude actually searched.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    answer_parts: List[str] = []
    async with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        tools=[WEB_SEARCH_TOOL],
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for event in stream:
            if event.type == "content_block_delta" and getattr(event.delta, "type", None) == "text_delta":
                delta = event.delta.text
                answer_parts.append(delta)
                if callback_handler is not None:
                    try:
                        await callback_handler.on_token(delta)
                    except Exception:
                        # A streaming hiccup on the socket must not abort the
                        # generation; the full answer is still returned below.
                        pass
        final_message = await stream.get_final_message()

    answer = "".join(answer_parts).strip()
    if not answer:
        # Fallback in case no text deltas were captured (e.g. non-delta stream).
        answer = "".join(
            block.text for block in final_message.content
            if getattr(block, "type", None) == "text"
        ).strip()

    web_sources = _extract_web_sources(final_message)
    return answer, web_sources


def _extract_web_sources(final_message: Any) -> List[Dict[str, Any]]:
    """Pull deduplicated ``{url, title}`` entries from web_search_tool_result blocks."""
    sources: List[Dict[str, Any]] = []
    seen = set()

    for block in getattr(final_message, "content", []) or []:
        if getattr(block, "type", None) != "web_search_tool_result":
            continue

        content = getattr(block, "content", None)
        # On success `content` is a list of results; on error it is a single
        # error object (e.g. {error_code: "max_uses_exceeded"}) — skip those.
        if not isinstance(content, list):
            continue

        for result in content:
            url = getattr(result, "url", None)
            if not url or url in seen:
                continue
            seen.add(url)
            title = getattr(result, "title", None) or url
            sources.append({"url": url, "title": title})

    return sources
