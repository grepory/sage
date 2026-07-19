// Vue.js component for model selection and querying

// Define available models
const availableModels = [
    { value: 'ollama:llama2', label: 'Ollama: Llama 2' },
    { value: 'ollama:mistral', label: 'Ollama: Mistral' },
    { value: 'ollama:nomic-embed-text', label: 'Ollama: Nomic Embed Text' },
    { value: 'anthropic:claude-sonnet-5', label: 'Anthropic: Claude Sonnet 5' },
    { value: 'anthropic:claude-opus-4-8', label: 'Anthropic: Claude Opus 4.8' },
    { value: 'anthropic:claude-haiku-4-5', label: 'Anthropic: Claude Haiku 4.5' },
    { value: 'openai:gpt-5.6-sol', label: 'OpenAI: GPT-5.6 Sol' }
];

// Create Vue app
const { createApp, ref, onMounted, onUnmounted, computed, watch, nextTick } = Vue;

const ModelQueryComponent = {
    template: `
        <div class="model-query-component">
            <!-- Conversation history - Primary visual element -->
            <div class="conversation-wrapper">
                
                <div v-if="conversationHistory.length > 0" class="conversation-history">
                    <div class="conversation-container p-3">
                        <div v-for="(message, index) in conversationHistory" :key="index"
                             :class="['msg-row', message.role === 'user' ? 'msg-user' : 'msg-assistant']">
                            <!-- User message -->
                            <div v-if="message.role === 'user'" class="user-bubble">
                                {{ message.content }}
                                <div class="message-actions">
                                    <button
                                        class="retry-btn"
                                        @click="retryMessage(index)"
                                        :disabled="isLoading"
                                        title="Retry with current tag selection"
                                        aria-label="Retry"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
                                    </button>
                                </div>
                            </div>
                            <!-- Assistant message -->
                            <template v-else>
                                <div class="assistant-avatar">S</div>
                                <div class="assistant-body">
                                    <div class="markdown-content" v-html="parseMarkdown(message.content, index)" @click="handleContentClick"></div>
                                    <div v-if="message.sources && message.sources.length" class="sources-row">
                                        <span class="sources-label">Sources</span>
                                        <template v-for="(src, sIdx) in message.sources" :key="sIdx">
                                            <a v-if="src.type === 'web'" :href="src.url" target="_blank" rel="noopener noreferrer"
                                               class="source-chip source-chip-web">
                                                <svg class="src-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                                {{ src.display_name }}
                                            </a>
                                            <span v-else
                                                  :id="'src-' + index + '-' + (sIdx + 1)"
                                                  class="source-chip">
                                                <svg class="src-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                                {{ src.display_name }}
                                            </span>
                                        </template>
                                    </div>
                                </div>
                            </template>
                        </div>

                        <!-- Typing indicator -->
                        <div v-if="isLoading && conversationHistory.length > 0" class="msg-row msg-assistant">
                            <div class="assistant-avatar">S</div>
                            <div class="assistant-body">
                                <div class="typing-text-pulse">Sage is typing…</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="empty-conversation-placeholder">
                    <div class="text-center text-muted p-5">
                        <i class="bi bi-chat-square-text fs-1"></i>
                        <p class="mt-3">Your conversation will appear here</p>
                    </div>
                </div>
            </div>
            
            <!-- Input area fixed at bottom -->
            <div class="chat-input-area">
                <!-- Inline selection controls above query input -->
                <div class="selection-controls mb-2 d-flex gap-2 align-items-center">
                    <!-- Model selection -->
                    <div class="model-selection-inline">
                        <select id="model-select" class="form-select form-select-sm" v-model="selectedModel" style="min-width: 180px;">
                            <option value="">Default Model</option>
                            <optgroup label="Ollama Models">
                                <option v-for="model in models.filter(m => m.value.startsWith('ollama'))" :key="model.value" :value="model.value">
                                    {{ model.label }}
                                </option>
                            </optgroup>
                            <optgroup label="Anthropic Models">
                                <option v-for="model in models.filter(m => m.value.startsWith('anthropic'))" :key="model.value" :value="model.value">
                                    {{ model.label }}
                                </option>
                            </optgroup>
                            <optgroup label="OpenAI Models">
                                <option v-for="model in models.filter(m => m.value.startsWith('openai'))" :key="model.value" :value="model.value">
                                    {{ model.label }}
                                </option>
                            </optgroup>
                        </select>
                    </div>

                    <!-- Web search toggle (Anthropic-native) -->
                    <label class="web-search-toggle" :class="{ disabled: !isAnthropicModel }"
                           :title="isAnthropicModel ? 'Let Claude search the web when the documents do not cover it' : 'Web search requires an Anthropic model'">
                        <input type="checkbox" v-model="webSearchEnabled" :disabled="!isAnthropicModel">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        <span>Web</span>
                    </label>

                    <!-- Tag selection -->
                    <div class="tag-selection-inline">
                        <div class="dropdown" :class="{ show: tagDropdownOpen }">
                            <button 
                                type="button" 
                                class="btn btn-outline-secondary btn-sm dropdown-toggle"
                                @click="toggleTagDropdown"
                                style="min-width: 120px;"
                            >
                                <svg class="chip-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                                <span v-if="selectedTags.length === 0">All docs</span>
                                <span v-else>{{ selectedTags.length }} tag{{ selectedTags.length !== 1 ? 's' : '' }}</span>
                            </button>
                            
                            <!-- Dropdown menu -->
                            <div v-if="tagDropdownOpen" class="dropdown-menu show" style="min-width: 300px;">
                                <!-- Search Input -->
                                <div class="px-3 py-2">
                                    <input 
                                        ref="tagSearchInput"
                                        type="text" 
                                        class="form-control form-control-sm" 
                                        placeholder="Search tags..."
                                        v-model="tagSearchQuery"
                                        @input="onTagSearch"
                                        @mousedown="$event.stopPropagation()"
                                    >
                                </div>
                                
                                <div class="dropdown-divider"></div>
                                
                                <!-- Include untagged option -->
                                <div class="px-3 py-1">
                                    <div class="form-check form-check-sm">
                                        <input 
                                            class="form-check-input" 
                                            type="checkbox" 
                                            id="includeUntaggedCheck"
                                            v-model="includeUntagged"
                                            @mousedown="$event.stopPropagation()"
                                        >
                                        <label class="form-check-label small" for="includeUntaggedCheck">
                                            Include untagged documents
                                        </label>
                                    </div>
                                </div>
                                
                                <div v-if="selectedTags.length > 0 || availableTagsForSelection.length > 0" class="dropdown-divider"></div>
                                
                                <!-- Selected tags -->
                                <div v-if="selectedTags.length > 0" class="px-3 py-1">
                                    <div class="small text-muted mb-1">Selected:</div>
                                    <div class="d-flex flex-wrap gap-1">
                                        <span 
                                            v-for="tag in selectedTags" 
                                            :key="'selected-' + tag"
                                            class="badge bg-primary d-flex align-items-center gap-1"
                                            style="cursor: pointer;"
                                            @click="removeTag(tag)"
                                            @mousedown="$event.stopPropagation()"
                                            title="Click to remove"
                                        >
                                            {{ tag }}
                                            <i class="bi bi-x"></i>
                                        </span>
                                    </div>
                                </div>
                                
                                <!-- Available tags -->
                                <div v-if="availableTagsForSelection.length > 0" class="px-3 py-1">
                                    <div v-if="selectedTags.length > 0" class="small text-muted mb-1">Available:</div>
                                    <div class="tag-list" style="max-height: 200px; overflow-y: auto;">
                                        <button
                                            v-for="tagResult in availableTagsForSelection.slice(0, 20)" 
                                            :key="'available-' + tagResult.item"
                                            type="button"
                                            class="btn btn-sm btn-outline-secondary me-1 mb-1"
                                            @click="addTag(tagResult.item)"
                                            @mousedown="$event.stopPropagation()"
                                        >
                                            {{ tagResult.item }} <small class="text-muted">({{ tagCounts[tagResult.item] || 0 }})</small>
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- No tags message -->
                                <div v-if="availableTags.length === 0" class="px-3 py-2 text-muted small">
                                    No tags found. Upload documents with tags first.
                                </div>
                                
                                <!-- No results -->
                                <div v-if="tagSearchQuery && availableTagsForSelection.length === 0 && availableTags.length > 0" class="px-3 py-2 text-muted small">
                                    No tags found matching "{{ tagSearchQuery }}"
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Query input -->
                <div class="query-input">
                    <textarea
                        id="query-textarea"
                        class="form-control"
                        v-model="queryText"
                        placeholder="Message Sage…"
                        rows="1"
                        @keydown.enter.prevent="handleEnterKey"
                        @input="autoGrow"
                    ></textarea>

                    <!-- Submit button -->
                    <button
                        class="send-button"
                        @click="submitQuery"
                        :disabled="isLoading || !canSubmit"
                        aria-label="Send"
                    >
                        <svg v-if="!isLoading" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                        <span v-if="isLoading" class="loading-spinner"></span>
                    </button>
                </div>
                
                <!-- Error message -->
                <div v-if="error" class="alert alert-danger mt-2 mb-0 py-2 small">
                    {{ error }}
                </div>
                
                <!-- Model and tag info -->
                <div class="model-info text-end">
                    <small class="text-muted">
                        <i class="bi bi-info-circle me-1"></i>
                        Model: {{ selectedModel || 'Default' }}
                        <span v-if="selectedTags.length > 0"> | Tags: {{ selectedTags.join(', ') }}</span>
                        <span v-if="includeUntagged && selectedTags.length > 0"> + untagged</span>
                        <span v-if="selectedTags.length === 0 && includeUntagged"> | All documents</span>
                    </small>
                </div>
            </div>
        </div>
    `,
    setup() {
        // Reactive state
        const collections = ref([]);  // Deprecated but kept for compatibility
        const selectedCollection = ref('');  // Deprecated
        const availableTags = ref([]);
        const tagCounts = ref({});
        const selectedTags = ref([]);
        const includeUntagged = ref(true);
        const tagSearchQuery = ref('');
        const tagDropdownOpen = ref(false);
        const tagSearchInput = ref(null);
        const models = ref(availableModels);
        const selectedModel = ref('anthropic:claude-sonnet-5');
        const webSearchEnabled = ref(false);
        // Web search is an Anthropic-native server tool, so it only applies to Anthropic models.
        const isAnthropicModel = computed(() => (selectedModel.value || '').startsWith('anthropic'));
        const queryText = ref('');
        const isLoading = ref(false);
        const error = ref('');
        const results = ref(null);
        const conversationHistory = ref([]);
        const lastSources = ref([]);
        const conversations = ref([]);
        const currentConversationId = ref(null);
        const isLoadingConversations = ref(false);
        
        // Local storage keys for persistence
        const STORAGE_KEY_COLLECTION = 'ragu_selected_collection';  // Deprecated
        const STORAGE_KEY_MODEL = 'ragu_selected_model';
        const STORAGE_KEY_WEB_SEARCH = 'ragu_web_search';
        const STORAGE_KEY_TAGS = 'ragu_selected_tags';
        const STORAGE_KEY_INCLUDE_UNTAGGED = 'ragu_include_untagged';
        
        // Computed properties
        const canSubmit = computed(() => {
            return queryText.value.trim().length > 0;  // No longer require collection selection
        });
        
        // Initialize Fuse.js for fuzzy search
        let fuse = null;
        
        // Available tags for selection with fuzzy search
        const availableTagsForSelection = computed(() => {
            const unselectedTags = availableTags.value.filter(tag => !selectedTags.value.includes(tag));
            
            if (!tagSearchQuery.value.trim()) {
                // No search query - return all unselected tags sorted by count
                return unselectedTags
                    .sort((a, b) => {
                        const countDiff = (tagCounts.value[b] || 0) - (tagCounts.value[a] || 0);
                        if (countDiff !== 0) return countDiff;
                        return a.localeCompare(b);
                    })
                    .map(tag => ({ item: tag }));
            }
            
            // Use Fuse.js for fuzzy search
            try {
                if (!fuse || !fuse.list || fuse.list.length !== unselectedTags.length) {
                    console.log('Initializing Fuse.js with', unselectedTags.length, 'tags');
                    fuse = new Fuse(unselectedTags, {
                        threshold: 0.4, // More lenient matching
                        distance: 100,
                        minMatchCharLength: 1,
                        includeScore: true
                    });
                }
                
                const searchResults = fuse.search(tagSearchQuery.value);
                console.log('Fuse search for "' + tagSearchQuery.value + '" found', searchResults.length, 'results');
                
                return searchResults.map(result => ({ 
                    item: result.item,
                    score: result.score 
                }));
            } catch (error) {
                console.error('Fuse.js error:', error);
                // Fallback to simple string matching
                const query = tagSearchQuery.value.toLowerCase();
                return unselectedTags
                    .filter(tag => tag.toLowerCase().includes(query))
                    .map(tag => ({ item: tag }));
            }
        });
        
        // Handle click outside to close dropdown
        const handleClickOutside = (event) => {
            if (!tagDropdownOpen.value) return;
            
            const dropdown = document.querySelector('.tag-selection-inline');
            if (dropdown && !dropdown.contains(event.target)) {
                tagDropdownOpen.value = false;
            }
        };
        
        // Fetch tags and load saved preferences on component mount
        onMounted(async () => {
            await fetchTags();
            
            // Add click outside listener
            document.addEventListener('click', handleClickOutside);
            
            // Load saved model preference
            const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
            if (savedModel) {
                // Check if the saved model exists in available models
                const modelExists = models.value.some(model => model.value === savedModel);
                if (modelExists) {
                    selectedModel.value = savedModel;
                }
            }

            // Load saved web search preference
            webSearchEnabled.value = localStorage.getItem(STORAGE_KEY_WEB_SEARCH) === 'true';
            
            // Load saved tag preferences
            const savedTags = localStorage.getItem(STORAGE_KEY_TAGS);
            if (savedTags) {
                try {
                    selectedTags.value = JSON.parse(savedTags);
                } catch (e) {
                    console.warn('Failed to parse saved tags:', e);
                }
            }
            
            const savedIncludeUntagged = localStorage.getItem(STORAGE_KEY_INCLUDE_UNTAGGED);
            if (savedIncludeUntagged !== null) {
                includeUntagged.value = savedIncludeUntagged === 'true';
            }
            
            // Load conversations for the sidebar
            fetchConversations();
            
            // Listen for custom events from sidebar
            document.addEventListener('loadConversation', (event) => {
                const conversationId = event.detail.conversationId;
                selectConversation(conversationId);
            });
            
            document.addEventListener('startNewConversation', () => {
                startNewConversation();
            });
            
            // Listen for when the user switches to chat interface
            document.addEventListener('tabSwitch', (event) => {
                if (event.detail && event.detail.tab === 'chat') {
                    fetchTags(); // Refresh tags when switching to chat
                }
            });
            
            // Listen for window focus events (user returning from another tab/window)
            window.addEventListener('focus', () => {
                fetchTags(); // Refresh tags when user returns to the window
            });
            
            // Listen for visibility change events
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    fetchTags(); // Refresh tags when page becomes visible
                }
            });
        });
        
        // Watch for changes to selectedTags and save to localStorage and update conversation
        watch(selectedTags, (newValue) => {
            localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(newValue));
            // Update conversation tag preferences if we have a current conversation (debounced)
            if (currentConversationId.value) {
                debouncedUpdateConversationTagPreferences(currentConversationId.value);
            }
        }, { deep: true });
        
        // Watch for changes to includeUntagged and save to localStorage and update conversation
        watch(includeUntagged, (newValue) => {
            localStorage.setItem(STORAGE_KEY_INCLUDE_UNTAGGED, newValue.toString());
            // Update conversation tag preferences if we have a current conversation (debounced)
            if (currentConversationId.value) {
                debouncedUpdateConversationTagPreferences(currentConversationId.value);
            }
        });
        
        // Watch for changes to selectedModel and save to localStorage
        watch(selectedModel, (newValue) => {
            if (newValue) {
                localStorage.setItem(STORAGE_KEY_MODEL, newValue);
            }
        });

        // Persist the web search toggle
        watch(webSearchEnabled, (newValue) => {
            localStorage.setItem(STORAGE_KEY_WEB_SEARCH, newValue ? 'true' : 'false');
        });
        
        // Fetch available tags from API
        const fetchTags = async () => {
            try {
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/tags/`);
                if (response.ok) {
                    const data = await response.json();
                    availableTags.value = data.tags || [];
                    tagCounts.value = data.tag_counts || {};
                } else {
                    console.error('Failed to fetch tags');
                    error.value = 'Failed to fetch tags. Please try again.';
                }
            } catch (err) {
                console.error('Error fetching tags:', err);
                error.value = `Error fetching tags: ${err.message}`;
            }
        };
        
        // Tag dropdown methods
        const toggleTagDropdown = () => {
            tagDropdownOpen.value = !tagDropdownOpen.value;
            if (tagDropdownOpen.value) {
                // Check dropdown positioning and focus search input
                nextTick(() => {
                    // Focus the search input
                    if (tagSearchInput.value) {
                        tagSearchInput.value.focus();
                    }
                    
                    // Check if dropdown would extend beyond viewport for inline Bootstrap dropdown
                    const dropdownContainer = document.querySelector('.tag-selection-inline .dropdown');
                    const dropdownMenu = document.querySelector('.tag-selection-inline .dropdown-menu');
                    if (dropdownContainer && dropdownMenu) {
                        const rect = dropdownContainer.getBoundingClientRect();
                        const dropdownHeight = 400; // max height
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const spaceAbove = rect.top;
                        
                        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                            dropdownContainer.classList.add('dropup');
                        } else {
                            dropdownContainer.classList.remove('dropup');
                        }
                    }
                });
            }
        };
        
        const handleTagDropdownBlur = (event) => {
            // Small delay to allow clicks inside dropdown to register
            setTimeout(() => {
                if (!tagDropdownOpen.value) return;
                
                // Check if focus moved to an element outside the dropdown
                const activeElement = document.activeElement;
                const dropdownContainer = event.currentTarget.closest('.tag-selection-inline');
                
                if (!dropdownContainer || !dropdownContainer.contains(activeElement)) {
                    tagDropdownOpen.value = false;
                }
            }, 150);
        };
        
        const onTagSearch = (event) => {
            // Force reactivity update for the search query
            const newValue = event.target.value;
            tagSearchQuery.value = newValue;
            console.log('Search query updated to:', newValue);
        };
        
        const addTag = (tag) => {
            if (!selectedTags.value.includes(tag)) {
                selectedTags.value.push(tag);
                tagSearchQuery.value = ''; // Clear search after selection
            }
        };
        
        const removeTag = (tag) => {
            const index = selectedTags.value.indexOf(tag);
            if (index > -1) {
                selectedTags.value.splice(index, 1);
            }
        };
        
        // Create a new collection
        const createCollection = async () => {
            const collectionName = prompt('Enter a name for the new collection:');
            if (!collectionName) return;
            
            try {
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/collections/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: collectionName,
                        description: `Collection created on ${new Date().toLocaleString()}`
                    })
                });
                
                if (response.ok) {
                    await fetchCollections();
                    selectedCollection.value = collectionName;
                } else {
                    const errorData = await response.json();
                    error.value = `Failed to create collection: ${errorData.detail || 'Unknown error'}`;
                }
            } catch (err) {
                console.error('Error creating collection:', err);
                error.value = `Error creating collection: ${err.message}`;
            }
        };
        
        // Fetch conversations from API
        const fetchConversations = async () => {
            isLoadingConversations.value = true;
            error.value = '';
            
            try {
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/conversations/`);
                if (response.ok) {
                    const data = await response.json();
                    conversations.value = data.conversations || [];
                } else {
                    console.error('Failed to fetch conversations');
                    error.value = 'Failed to fetch conversations. Please try again.';
                }
            } catch (err) {
                console.error('Error fetching conversations:', err);
                error.value = `Error fetching conversations: ${err.message}`;
            } finally {
                isLoadingConversations.value = false;
            }
        };
        
        // Select a conversation
        const selectConversation = async (conversationId) => {
            try {
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/conversations/${conversationId}`);
                if (response.ok) {
                    const conversation = await response.json();
                    
                    // Set the current conversation ID
                    currentConversationId.value = conversationId;
                    
                    // Set the conversation history
                    conversationHistory.value = conversation.messages;
                    
                    // Refresh tags first to get any newly added tags
                    await fetchTags();
                    
                    // Set the tags and model if available
                    if (conversation.tags) {
                        selectedTags.value = conversation.tags;
                        console.log(`Loaded conversation with tags: ${conversation.tags.join(', ')}`);
                    } else {
                        selectedTags.value = [];
                    }
                    
                    // Set the include_untagged preference
                    if (conversation.include_untagged !== undefined) {
                        includeUntagged.value = conversation.include_untagged;
                        console.log(`Loaded conversation with include_untagged: ${conversation.include_untagged}`);
                    } else {
                        includeUntagged.value = true;  // Default to true for backward compatibility
                    }
                    
                    if (conversation.model) {
                        selectedModel.value = conversation.model;
                    }
                    
                    // Scroll to the bottom of the conversation container
                    setTimeout(() => {
                        const container = document.querySelector('.conversation-container');
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }, 50);
                } else {
                    const errorData = await response.json();
                    error.value = `Failed to load conversation: ${errorData.detail || 'Unknown error'}`;
                }
            } catch (err) {
                console.error('Error loading conversation:', err);
                error.value = `Error loading conversation: ${err.message}`;
            }
        };
        
        // Start a new conversation
        const startNewConversation = async () => {
            // Clear the current conversation
            currentConversationId.value = null;
            conversationHistory.value = [];
            
            // Refresh tags to get any newly added tags
            await fetchTags();
        };
        
        // Load a conversation (called from sidebar)
        const loadConversation = (conversationId) => {
            selectConversation(conversationId);
        };
        
        // Debounce timer for tag preference updates
        let tagUpdateTimeout = null;
        
        // Update conversation tag preferences with debouncing
        const updateConversationTagPreferences = async (conversationId) => {
            try {
                const updateData = {
                    tags: selectedTags.value,
                    include_untagged: includeUntagged.value
                };
                
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/conversations/${conversationId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                });
                
                if (response.ok) {
                    console.log('Updated conversation tag preferences');
                } else {
                    console.warn('Failed to update conversation tag preferences');
                }
            } catch (err) {
                console.warn('Error updating conversation tag preferences:', err);
            }
        };
        
        // Debounced version of the update function
        const debouncedUpdateConversationTagPreferences = (conversationId) => {
            if (tagUpdateTimeout) {
                clearTimeout(tagUpdateTimeout);
            }
            tagUpdateTimeout = setTimeout(() => {
                updateConversationTagPreferences(conversationId);
            }, 500); // Wait 500ms after the last change
        };
        
        // Handle Enter key press
        const handleEnterKey = (event) => {
            // Only submit if not pressing shift+enter (which should create a new line)
            if (!event.shiftKey && queryText.value.trim()) {
                submitQuery();
            }
        };
        
        // Submit query to API
        const submitQuery = async () => {
            if (!canSubmit.value) return;
            
            const currentQuery = queryText.value;
            
            // Add user message to conversation history immediately
            conversationHistory.value.push({
                role: 'user',
                content: currentQuery
            });
            
            // Clear the query text immediately
            queryText.value = '';
            
            // Set loading state
            isLoading.value = true;
            error.value = '';
            
            // Scroll to the bottom of the conversation container
            setTimeout(() => {
                const container = document.querySelector('.conversation-container');
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            }, 50);
            
            try {
                // Prepare request data for tag-based system
                // Use the conversation history minus the user message we just added for the request
                const requestData = {
                    query: currentQuery,
                    history: conversationHistory.value.slice(0, -1), // Exclude the user message we just added
                    tags: selectedTags.value,
                    include_untagged: includeUntagged.value,
                    // Web search is Anthropic-native; only request it for Anthropic models.
                    web_search: webSearchEnabled.value && (selectedModel.value || '').startsWith('anthropic')
                };
                
                // Add model if selected
                if (selectedModel.value) {
                    requestData.model = selectedModel.value;
                }
                
                // Add conversation ID if we're continuing a conversation
                if (currentConversationId.value) {
                    requestData.conversation_id = currentConversationId.value;
                }
                
                // Send request to chat API
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/chat/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestData)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    results.value = data;
                    
                    // Update conversation history with the response, preserving
                    // per-message sources and attaching this turn's sources to
                    // the newest assistant message so it renders its Sources row.
                    conversationHistory.value = mergeHistoryWithSources(data.history, data.sources);

                    // Update last sources
                    lastSources.value = data.sources;
                    
                    // Update selected tags if auto-selection occurred
                    if (data.selected_tags && Array.isArray(data.selected_tags)) {
                        selectedTags.value = data.selected_tags;
                    }
                    
                    // Show notification for auto-selected tags
                    if (data.auto_selected_tags && data.auto_selected_tags.length > 0) {
                        console.log('Auto-selected tags for this query:', data.auto_selected_tags.join(', '));
                        showAutoTagNotification(data.auto_selected_tags);
                    }
                    
                    // Update current conversation ID if provided
                    if (data.conversation_id) {
                        currentConversationId.value = data.conversation_id;
                        
                        // Update conversation with current tag preferences (now including auto-selected tags)
                        updateConversationTagPreferences(currentConversationId.value);
                    }
                    
                    // Refresh sidebar conversations if function is available
                    if (window.refreshSidebarConversations) {
                        window.refreshSidebarConversations();
                    }
                    
                    // Refresh tags in case new ones were created
                    fetchTags();
                    
                    // Scroll to the bottom of the conversation container
                    setTimeout(() => {
                        const container = document.querySelector('.conversation-container');
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }, 50);
                    
                    // Clear the results container (we're now using the conversation history)
                    const resultsContainer = document.getElementById('results-container');
                    if (resultsContainer) {
                        resultsContainer.innerHTML = '';
                    }
                } else {
                    // Remove the user message we added and restore the query text
                    conversationHistory.value.pop();
                    queryText.value = currentQuery;
                    
                    const errorData = await response.json();
                    error.value = errorData.detail || 'Failed to process query. Please try again.';
                }
            } catch (err) {
                // Remove the user message we added and restore the query text
                conversationHistory.value.pop();
                queryText.value = currentQuery;
                
                console.error('Error submitting query:', err);
                error.value = `Error submitting query: ${err.message}`;
            } finally {
                isLoading.value = false;
            }
        };
        
        // Rename a conversation
        const renameConversation = async (conversation) => {
            // Prompt for new title
            const newTitle = prompt('Enter a new title for the conversation:', conversation.title);
            
            // If user cancels or enters an empty title, do nothing
            if (!newTitle || newTitle.trim() === '') return;
            
            try {
                // Send request to update the conversation
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/conversations/${conversation.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: newTitle.trim()
                    })
                });
                
                if (response.ok) {
                    // Update the conversation in the list
                    const updatedConversation = await response.json();
                    const index = conversations.value.findIndex(c => c.id === conversation.id);
                    if (index !== -1) {
                        conversations.value[index] = updatedConversation;
                    }
                    
                    // If this is the current conversation, update the title in the header
                    if (currentConversationId.value === conversation.id) {
                        // The title will be updated automatically through the conversations array
                    }
                } else {
                    const errorData = await response.json();
                    error.value = `Failed to rename conversation: ${errorData.detail || 'Unknown error'}`;
                }
            } catch (err) {
                console.error('Error renaming conversation:', err);
                error.value = `Error renaming conversation: ${err.message}`;
            }
        };
        
        // Confirm deletion of a conversation
        const confirmDeleteConversation = (conversation) => {
            if (confirm(`Are you sure you want to delete the conversation "${conversation.title}"? This action cannot be undone.`)) {
                deleteConversation(conversation.id);
            }
        };
        
        // Delete a conversation
        const deleteConversation = async (conversationId) => {
            try {
                // Send request to delete the conversation
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/conversations/${conversationId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    // Remove the conversation from the list
                    conversations.value = conversations.value.filter(c => c.id !== conversationId);
                    
                    // If this is the current conversation, clear it
                    if (currentConversationId.value === conversationId) {
                        currentConversationId.value = null;
                        conversationHistory.value = [];
                    }
                } else {
                    const errorData = await response.json();
                    error.value = `Failed to delete conversation: ${errorData.detail || 'Unknown error'}`;
                }
            } catch (err) {
                console.error('Error deleting conversation:', err);
                error.value = `Error deleting conversation: ${err.message}`;
            }
        };
        
        // Retry a message with current tag context
        const retryMessage = async (messageIndex) => {
            if (isLoading.value || messageIndex >= conversationHistory.value.length) return;
            
            const userMessage = conversationHistory.value[messageIndex];
            if (userMessage.role !== 'user') return;
            
            // Remove all messages after the selected user message
            const newHistory = conversationHistory.value.slice(0, messageIndex + 1);
            conversationHistory.value = newHistory;
            
            // Set loading state
            isLoading.value = true;
            error.value = '';
            
            // Scroll to the bottom of the conversation container
            setTimeout(() => {
                const container = document.querySelector('.conversation-container');
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            }, 50);
            
            try {
                // Prepare request data with current tag selection
                const requestData = {
                    query: userMessage.content,
                    history: conversationHistory.value.slice(0, -1), // Exclude the user message
                    tags: selectedTags.value,
                    include_untagged: includeUntagged.value,
                    // Web search is Anthropic-native; only request it for Anthropic models.
                    web_search: webSearchEnabled.value && (selectedModel.value || '').startsWith('anthropic')
                };
                
                // Add model if selected
                if (selectedModel.value) {
                    requestData.model = selectedModel.value;
                }
                
                // Add conversation ID if we're continuing a conversation
                if (currentConversationId.value) {
                    requestData.conversation_id = currentConversationId.value;
                }
                
                // Send request to chat API
                const response = await fetch(`${window.BASE_URL || ''}/api/v1/chat/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestData)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    results.value = data;
                    
                    // Update conversation history with the response, preserving
                    // per-message sources and attaching this turn's sources to
                    // the newest assistant message so it renders its Sources row.
                    conversationHistory.value = mergeHistoryWithSources(data.history, data.sources);

                    // Update last sources
                    lastSources.value = data.sources;
                    
                    // Update selected tags if auto-selection occurred
                    if (data.selected_tags && Array.isArray(data.selected_tags)) {
                        selectedTags.value = data.selected_tags;
                    }
                    
                    // Show notification for auto-selected tags
                    if (data.auto_selected_tags && data.auto_selected_tags.length > 0) {
                        console.log('Auto-selected tags for retry:', data.auto_selected_tags.join(', '));
                        showAutoTagNotification(data.auto_selected_tags);
                    }
                    
                    // Update current conversation ID if provided
                    if (data.conversation_id) {
                        currentConversationId.value = data.conversation_id;
                        
                        // Update conversation with current tag preferences (now including auto-selected tags)
                        updateConversationTagPreferences(currentConversationId.value);
                    }
                    
                    // Refresh sidebar conversations if function is available
                    if (window.refreshSidebarConversations) {
                        window.refreshSidebarConversations();
                    }
                    
                    // Refresh tags in case new ones were created
                    fetchTags();
                    
                    // Scroll to the bottom of the conversation container
                    setTimeout(() => {
                        const container = document.querySelector('.conversation-container');
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }, 50);
                } else {
                    const errorData = await response.json();
                    error.value = errorData.detail || 'Failed to retry query. Please try again.';
                }
            } catch (err) {
                console.error('Error retrying query:', err);
                error.value = `Error retrying query: ${err.message}`;
            } finally {
                isLoading.value = false;
            }
        };
        
        // Escape HTML special characters for safe interpolation
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str == null ? '' : String(str);
            return div.innerHTML;
        };

        // Parse markdown content, converting [[cite:N|label]] tokens into
        // clickable citation chips bound to this message's sources row.
        const parseMarkdown = (content, messageIndex) => {
            if (!content) return '';

            // Configure marked.js for security and formatting
            marked.setOptions({
                breaks: true, // Convert line breaks to <br>
                gfm: true, // GitHub flavored markdown
                sanitize: false, // We'll handle XSS protection through DOMPurify if needed
                smartLists: true,
                smartypants: false
            });

            // Pull citation tokens out BEFORE markdown parsing so marked can't
            // mangle the bracket syntax or punctuation in the label.
            const chips = [];
            const guarded = content.replace(/\[\[cite:(\d+)\|([^\]]*?)\]\]/g, (match, n, label) => {
                const token = `%%CITE${chips.length}%%`;
                chips.push({ n: parseInt(n, 10), label: label.trim() });
                return token;
            });

            let html = marked.parse(guarded);

            // Re-insert citation chips as clickable spans that point at the
            // matching source in this message's Sources row.
            chips.forEach((chip, i) => {
                const target = (messageIndex !== undefined && messageIndex !== null)
                    ? `src-${messageIndex}-${chip.n}`
                    : '';
                const chipHtml = `<span class="citation-chip" data-target="${target}" role="button" tabindex="0" title="Jump to source ${chip.n}">${escapeHtml(chip.label)}</span>`;
                html = html.replace(`%%CITE${i}%%`, chipHtml);
            });

            return html;
        };

        // Delegated click handler for inline citation chips: scroll to and
        // briefly highlight the corresponding source chip.
        const handleContentClick = (event) => {
            const chip = event.target.closest('.citation-chip');
            if (!chip) return;
            const targetId = chip.getAttribute('data-target');
            if (!targetId) return;
            const el = document.getElementById(targetId);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('source-chip-flash');
            setTimeout(() => el.classList.remove('source-chip-flash'), 1300);
        };

        // Auto-grow the composer textarea as the user types.
        const autoGrow = (event) => {
            const el = event && event.target ? event.target : document.getElementById('query-textarea');
            if (!el) return;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 200) + 'px';
        };

        // Preserve per-message sources across a history replacement, and attach
        // the latest retrieval's sources to the newest assistant message.
        const mergeHistoryWithSources = (newHistory, newSources) => {
            const priorSources = conversationHistory.value.map(m => m && m.sources);
            const merged = (newHistory || []).map((m, i) => (
                priorSources[i] ? { ...m, sources: priorSources[i] } : { ...m }
            ));
            for (let i = merged.length - 1; i >= 0; i--) {
                if (merged[i].role === 'assistant') {
                    if (newSources && newSources.length) merged[i].sources = newSources;
                    break;
                }
            }
            return merged;
        };
        
        // Show notification for auto-selected tags
        const showAutoTagNotification = (autoSelectedTags) => {
            if (!autoSelectedTags || autoSelectedTags.length === 0) return;
            
            // Create a temporary notification element
            const notification = document.createElement('div');
            notification.className = 'alert alert-info alert-dismissible fade show position-fixed';
            notification.style.cssText = 'top: 20px; right: 20px; z-index: 1050; max-width: 300px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);';
            
            const tagList = autoSelectedTags.map(tag => `<span class="badge" style="background-color: var(--salon-drab); margin-right: 4px;">${tag}</span>`).join('');
            
            notification.innerHTML = `
                <div class="d-flex align-items-start">
                    <i class="bi bi-magic text-primary me-2 mt-1"></i>
                    <div class="flex-grow-1">
                        <div class="fw-bold mb-1">Tags Added Automatically</div>
                        <div class="small">${tagList}</div>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        };
        
        // Cleanup event listener
        onUnmounted(() => {
            document.removeEventListener('click', handleClickOutside);
        });
        
        return {
            collections,  // Deprecated but kept for compatibility
            selectedCollection,  // Deprecated
            availableTags,
            tagCounts,
            selectedTags,
            includeUntagged,
            tagSearchQuery,
            tagDropdownOpen,
            tagSearchInput,
            availableTagsForSelection,
            models,
            selectedModel,
            webSearchEnabled,
            isAnthropicModel,
            queryText,
            isLoading,
            error,
            results,
            conversationHistory,
            lastSources,
            conversations,
            currentConversationId,
            isLoadingConversations,
            canSubmit,
            submitQuery,
            handleEnterKey,
            toggleTagDropdown,
            handleTagDropdownBlur,
            onTagSearch,
            addTag,
            removeTag,
            createCollection,  // Deprecated
            fetchTags,
            fetchConversations,
            selectConversation,
            startNewConversation,
            loadConversation,
            updateConversationTagPreferences,
            renameConversation,
            confirmDeleteConversation,
            retryMessage,
            parseMarkdown,
            handleContentClick,
            autoGrow
        };
    }
};

// Create and mount the Vue app with error handling
try {
    console.log('Initializing Vue app...');
    
    const app = createApp({
        components: {
            'model-query-component': ModelQueryComponent
        }
    });
    
    const container = document.getElementById('model-query-container');
    if (container) {
        app.mount('#model-query-container');
        console.log('Vue app mounted successfully');
    } else {
        console.error('Vue container #model-query-container not found');
    }
    
} catch (error) {
    console.error('Error initializing Vue app:', error);
    
    // Fallback: Create basic functionality without Vue
    const fallbackContainer = document.getElementById('model-query-container');
    if (fallbackContainer) {
        fallbackContainer.innerHTML = `
            <div class="alert alert-warning" role="alert">
                <h4 class="alert-heading">Chat Interface Error</h4>
                <p>The chat interface failed to load. Please refresh the page or contact support.</p>
                <hr>
                <p class="mb-0">Error: ${error.message}</p>
            </div>
        `;
    }
}