const API_BASE_URL = window.location.origin;

let hls = null;

document.addEventListener('DOMContentLoaded', () => {
    loadChannels();
    loadUserAgents();
    setupFormHandlers();
    setupAutoDetectForm();
});

function setupFormHandlers() {
    setupChannelForm();
    setupUserAgentForm();
    setupUserAgentSelect();
}

function setupUserAgentForm() {
    const form = document.getElementById('userAgentForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userAgentData = {
            nickname: document.getElementById('ua_nickname').value,
            user_agent: document.getElementById('ua_string').value
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/user-agents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userAgentData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save user agent');
            }

            form.reset();
            await loadUserAgents();
            alert('User agent saved successfully!');
        } catch (error) {
            console.error('Error saving user agent:', error);
            alert(`Failed to save user agent: ${error.message}`);
        }
    });
}

function setupUserAgentSelect() {
    const select = document.getElementById('saved_user_agents');
    const userAgentInput = document.getElementById('user_agent');
    
    select.addEventListener('change', () => {
        if (select.value) {
            userAgentInput.value = select.value;
        }
    });
}

async function loadUserAgents() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user-agents`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const userAgents = await response.json();
        displayUserAgents(userAgents);
        updateUserAgentSelect(userAgents);
    } catch (error) {
        console.error('Error loading user agents:', error);
    }
}

function displayUserAgents(userAgents) {
    const container = document.getElementById('userAgentList');
    container.innerHTML = '';

    userAgents.forEach(ua => {
        const div = document.createElement('div');
        div.className = 'bg-white p-3 rounded-lg shadow-sm flex justify-between items-center hover:shadow-md transition-shadow';
        div.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900">${ua.nickname}</div>
                <div class="text-sm text-gray-500 truncate">${ua.user_agent}</div>
            </div>
            <button onclick="deleteUserAgent(${ua.id})" class="ml-4 text-red-500 hover:text-red-700 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        `;
        container.appendChild(div);
    });
}

function updateUserAgentSelect(userAgents) {
    const select = document.getElementById('saved_user_agents');
    select.innerHTML = '<option value="">Select a saved User Agent</option>';
    
    userAgents.forEach(ua => {
        const option = document.createElement('option');
        option.value = ua.user_agent;
        option.textContent = ua.nickname;
        select.appendChild(option);
    });
}

async function deleteUserAgent(id) {
    if (!confirm('Are you sure you want to delete this user agent?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/user-agents/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        await loadUserAgents();
    } catch (error) {
        console.error('Error deleting user agent:', error);
        alert(`Failed to delete user agent: ${error.message}`);
    }
}

function setupChannelForm() {
    const form = document.getElementById('channelForm');
    console.log('Setting up channel form handler');
    
    if (!form) {
        console.error('Channel form not found!');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted');
        
        const channelData = {
            name: document.getElementById('name').value,
            m3u_url: document.getElementById('m3u_url').value,
            icon_url: document.getElementById('icon_url').value || null,
            user_agent: document.getElementById('user_agent').value || null,
            referer: document.getElementById('referer').value || null,
            origin: document.getElementById('origin').value || null
        };

        const editingChannelId = form.dataset.editingChannelId;
        const isEditing = !!editingChannelId;
        
        const requestUrl = isEditing 
            ? `${API_BASE_URL}/api/channels/${editingChannelId}`
            : `${API_BASE_URL}/api/channels`;
            
        const method = isEditing ? 'PUT' : 'POST';

        console.log(`${isEditing ? 'Updating' : 'Creating'} channel:`, channelData);
        console.log('Sending to URL:', requestUrl);

        try {
            console.log('Starting fetch request...');
            const response = await fetch(requestUrl, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(channelData)
            });

            console.log('Response received:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            let responseData;
            try {
                const text = await response.text();
                console.log('Raw response:', text);
                try {
                    responseData = JSON.parse(text);
                    console.log('Parsed JSON response:', responseData);
                } catch (parseError) {
                    console.error('Failed to parse response as JSON:', parseError);
                    responseData = { error: text };
                }
            } catch (textError) {
                console.error('Failed to read response text:', textError);
                throw new Error('Failed to read server response');
            }

            if (!response.ok) {
                throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
            }

            console.log('Channel operation successful:', responseData);
            
            // Reset form and update UI
            form.reset();
            form.dataset.editingChannelId = '';
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.textContent = 'Add Channel';
            
            await loadChannels();
            alert(`Channel ${isEditing ? 'updated' : 'added'} successfully!`);
        } catch (error) {
            console.error('Detailed error:', {
                message: error.message,
                stack: error.stack,
                error: error
            });
            alert(`Failed to ${isEditing ? 'update' : 'add'} channel: ${error.message}\nPlease check the browser console for more details.`);
        }
    });
}

async function loadChannels() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/channels`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }
        const channels = await response.json();
        displayChannels(channels);
    } catch (error) {
        console.error('Error loading channels:', error);
        alert(`Failed to load channels: ${error.message}`);
    }
}

function displayChannels(channels) {
    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '';

    // Add section title and bulk actions
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-6 bg-white p-4 rounded-lg shadow-sm';
    header.innerHTML = `
        <div class="flex items-center space-x-4">
            <h2 class="text-xl font-semibold text-gray-900">Channels</h2>
            <div class="flex items-center">
                <input type="checkbox" id="selectAllChannels" class="rounded border-gray-300 text-indigo-600 shadow-sm mr-2"
                       onchange="toggleAllChannels()">
                <label for="selectAllChannels" class="text-sm text-gray-700">Select All</label>
            </div>
        </div>
        <button id="updateSelectedButton" onclick="updateSelectedChannels()"
                class="bg-indigo-500 text-white px-4 py-2 rounded-md hover:bg-indigo-600 transition-colors flex items-center text-sm">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Update Selected
        </button>
    `;
    channelList.appendChild(header);

    // Create channel list container
    const listContainer = document.createElement('div');
    listContainer.className = 'space-y-2';

    channels.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'channel-card bg-white rounded-lg shadow-sm hover:shadow transition-shadow p-3';
        
        // Convert GitHub blob URL to raw URL
        let iconUrl = channel.icon_url;
        if (iconUrl && iconUrl.includes('github.com') && iconUrl.includes('/blob/')) {
            iconUrl = iconUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        }
        
        const defaultIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjIiIHk9IjciIHdpZHRoPSIyMCIgaGVpZ2h0PSIxNSIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PHBvbHlsaW5lIHBvaW50cz0iMTcgMiAxMiA3IDcgMiI+PC9wb2x5bGluZT48L3N2Zz4=';

        // Create a safe version of the channel object for the onclick handler
        const safeChannel = {
            id: channel.id,
            name: channel.name,
            m3u_url: channel.m3u_url,
            website_url: channel.website_url,
            icon_url: channel.icon_url,
            user_agent: channel.user_agent,
            referer: channel.referer,
            origin: channel.origin,
            auto_update_enabled: channel.auto_update_enabled,
            auto_update_interval: channel.auto_update_interval,
            last_update: channel.last_update
        };

        // Format last update time
        const lastUpdateText = channel.last_update 
            ? new Date(channel.last_update).toLocaleString()
            : 'Never';

        card.innerHTML = `
            <div class="flex items-center">
                <input type="checkbox" class="channel-checkbox rounded border-gray-300 text-indigo-600 shadow-sm mr-3"
                       data-channel-id="${channel.id}">
                <img src="${iconUrl || defaultIcon}" alt="${channel.name}" 
                     class="channel-icon w-6 h-6 mr-3" onerror="this.src='${defaultIcon}'">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <h3 class="text-base font-medium text-gray-900">${channel.name}</h3>
                        <div class="flex space-x-2">
                            <button onclick='editChannel(${JSON.stringify(safeChannel).replace(/'/g, "\\'")})'
                                class="text-gray-400 hover:text-yellow-500 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                            </button>
                            <button onclick="deleteChannel(${channel.id})" 
                                    class="text-gray-400 hover:text-red-500 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="text-sm text-gray-500 truncate">${channel.m3u_url}</div>
                    ${channel.auto_update_enabled ? `
                        <div class="text-xs text-gray-400 mt-1">
                            Updates every ${formatUpdateInterval(channel.auto_update_interval)} • Last update: ${lastUpdateText}
                        </div>
                    ` : ''}
                </div>
            </div>`;

        listContainer.appendChild(card);
    });

    channelList.appendChild(listContainer);
}

function getProxiedStreamUrl(channel) {
    const headers = {
        'User-Agent': channel.user_agent,
        'Referer': channel.referer,
        'Origin': channel.origin
    };
    
    // Filter out null or undefined values
    Object.keys(headers).forEach(key => {
        if (!headers[key]) delete headers[key];
    });
    
    const params = new URLSearchParams({
        url: channel.m3u_url,
        headers: encodeURIComponent(JSON.stringify(headers))
    });
    
    return `${API_BASE_URL}/proxy/stream?${params.toString()}`;
}

async function deleteChannel(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/channels/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        loadChannels();
    } catch (error) {
        console.error('Error deleting channel:', error);
        alert(`Failed to delete channel: ${error.message}`);
    }
}

async function editChannel(channel) {
    // Show the modal with existing channel data
    const modal = document.getElementById('autoDetectModal');
    
    // Convert total hours to days and hours
    const { days, hours } = getDaysAndHours(channel.auto_update_interval || 12);
    
    // Populate form fields
    document.getElementById('modal_name').value = channel.name;
    document.getElementById('modal_website_url').value = channel.website_url || '';
    document.getElementById('modal_m3u_url').value = channel.m3u_url;
    document.getElementById('modal_user_agent').value = channel.user_agent || '';
    document.getElementById('modal_referer').value = channel.referer || '';
    document.getElementById('modal_origin').value = channel.origin || '';
    document.getElementById('modal_icon_url').value = channel.icon_url || '';
    document.getElementById('modal_auto_update').checked = channel.auto_update_enabled || false;
    document.getElementById('modal_update_days').value = days;
    document.getElementById('modal_update_hours').value = hours;
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Setup form submission for edit mode
    const form = document.getElementById('autoDetectForm_modal');
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const days = parseInt(document.getElementById('modal_update_days').value);
        const hours = parseInt(document.getElementById('modal_update_hours').value);
        
        const channelData = {
            name: document.getElementById('modal_name').value,
            website_url: document.getElementById('modal_website_url').value,
            m3u_url: document.getElementById('modal_m3u_url').value,
            icon_url: document.getElementById('modal_icon_url').value || null,
            user_agent: document.getElementById('modal_user_agent').value || null,
            referer: document.getElementById('modal_referer').value || null,
            origin: document.getElementById('modal_origin').value || null,
            auto_update_enabled: document.getElementById('modal_auto_update').checked,
            auto_update_interval: getTotalHours(days, hours)
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/channels/${channel.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(channelData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update channel');
            }

            await loadChannels();
            closeAutoDetectModal();
            alert('Channel updated successfully!');
        } catch (error) {
            console.error('Error updating channel:', error);
            alert(`Failed to update channel: ${error.message}`);
        }
    };
}

// Add modal HTML to the page
document.body.insertAdjacentHTML('beforeend', `
    <div id="autoDetectModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full">
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div class="mt-3">
                <h3 class="text-lg font-medium leading-6 text-gray-900 mb-4">Stream Details</h3>
                <div id="stream_type_indicator" class="text-sm text-blue-600 font-medium mb-4"></div>
                <form id="autoDetectForm_modal" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Name</label>
                        <input type="text" id="modal_name" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Website URL</label>
                        <div class="flex space-x-2">
                            <input type="text" id="modal_website_url" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                            <button type="button" onclick="redetectHeaders()" class="mt-1 px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">M3U URL</label>
                        <input type="text" id="modal_m3u_url" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" readonly>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">User Agent</label>
                        <input type="text" id="modal_user_agent" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Referer</label>
                        <input type="text" id="modal_referer" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Origin</label>
                        <input type="text" id="modal_origin" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Icon URL</label>
                        <input type="text" id="modal_icon_url" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" id="modal_auto_update" class="rounded border-gray-300 text-indigo-600 shadow-sm">
                        <label class="ml-2 block text-sm text-gray-900">Enable Auto-Update</label>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Update Interval</label>
                        <div class="mt-1 flex items-center space-x-2">
                            <select id="modal_update_days" class="block w-24 rounded-md border-gray-300 shadow-sm">
                                <option value="0">0 days</option>
                                <option value="1">1 day</option>
                                <option value="2">2 days</option>
                                <option value="3">3 days</option>
                                <option value="4">4 days</option>
                                <option value="5">5 days</option>
                                <option value="6">6 days</option>
                                <option value="7">7 days</option>
                            </select>
                            <select id="modal_update_hours" class="block w-24 rounded-md border-gray-300 shadow-sm">
                                <option value="0">0 hours</option>
                                <option value="1">1 hour</option>
                                <option value="2">2 hours</option>
                                <option value="3">3 hours</option>
                                <option value="4">4 hours</option>
                                <option value="6">6 hours</option>
                                <option value="8">8 hours</option>
                                <option value="12">12 hours</option>
                                <option value="16">16 hours</option>
                                <option value="20">20 hours</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end space-x-3 mt-5">
                        <button type="button" onclick="closeAutoDetectModal()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">
                            Cancel
                        </button>
                        <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                            Save Channel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
`);

// Function to format interval display
function formatUpdateInterval(hours) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (days === 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (remainingHours === 0) {
        return `${days} day${days > 1 ? 's' : ''}`;
    } else {
        return `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
    }
}

// Function to convert days and hours to total hours
function getTotalHours(days, hours) {
    const totalHours = (days * 24) + hours;
    return Math.min(totalHours, 168); // Ensure we don't exceed 7 days (168 hours)
}

// Function to convert total hours to days and hours
function getDaysAndHours(totalHours) {
    totalHours = Math.min(totalHours || 0, 168); // Ensure we don't exceed 7 days
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return { days, hours };
}

function setupAutoDetectForm() {
    const form = document.getElementById('autoDetectForm');
    const buttonText = document.getElementById('autoDetectButtonText');
    const spinner = document.getElementById('autoDetectSpinner');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = document.getElementById('webpage_url').value;
        console.log('Auto-detect requested for URL:', url);
        
        // Show loading state
        buttonText.textContent = 'Detecting...';
        spinner.classList.remove('hidden');
        form.querySelector('button').disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/auto-detect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to auto-detect stream');
            }

            const data = await response.json();
            console.log('Raw auto-detect response:', data);
            
            // Show the modal with the detected data
            showAutoDetectModal({
                website_url: url,
                m3u_url: data.m3uUrl,
                name: new URL(url).hostname.replace('www.', '').split('.')[0]
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' '),
                ...data.headers
            });

        } catch (error) {
            console.error('Auto-detect error:', error);
            alert(error.message);
        } finally {
            // Reset form state
            buttonText.textContent = 'Auto-detect Stream';
            spinner.classList.add('hidden');
            form.querySelector('button').disabled = false;
        }
    });
}

function showAutoDetectModal(data) {
    const modal = document.getElementById('autoDetectModal');
    
    // Populate form fields
    document.getElementById('modal_name').value = data.name;
    document.getElementById('modal_website_url').value = data.website_url;
    document.getElementById('modal_m3u_url').value = data.m3u_url;
    document.getElementById('modal_user_agent').value = data.userAgent || '';
    document.getElementById('modal_referer').value = data.referer || '';
    document.getElementById('modal_origin').value = data.origin || '';
    document.getElementById('modal_update_days').value = 0;
    document.getElementById('modal_update_hours').value = 12;

    // Setup update interval handlers
    setupUpdateIntervalHandlers();

    // Add HLS indicator if detected
    const streamTypeIndicator = document.getElementById('stream_type_indicator');
    if (streamTypeIndicator) {
        streamTypeIndicator.textContent = data.isHLS ? 'HLS Stream (.m3u8)' : 'M3U Stream';
        streamTypeIndicator.className = data.isHLS ? 
            'text-sm text-green-600 font-medium' : 
            'text-sm text-blue-600 font-medium';
    }
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Setup form submission
    const form = document.getElementById('autoDetectForm_modal');
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const days = parseInt(document.getElementById('modal_update_days').value);
        const hours = parseInt(document.getElementById('modal_update_hours').value);
        
        const channelData = {
            name: document.getElementById('modal_name').value,
            website_url: document.getElementById('modal_website_url').value,
            m3u_url: document.getElementById('modal_m3u_url').value,
            icon_url: document.getElementById('modal_icon_url').value || null,
            user_agent: document.getElementById('modal_user_agent').value || null,
            referer: document.getElementById('modal_referer').value || null,
            origin: document.getElementById('modal_origin').value || null,
            auto_update_enabled: document.getElementById('modal_auto_update').checked,
            auto_update_interval: getTotalHours(days, hours),
            is_hls: data.isHLS || false
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/channels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(channelData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save channel');
            }

            await loadChannels();
            closeAutoDetectModal();
            alert('Channel saved successfully!');
        } catch (error) {
            console.error('Error saving channel:', error);
            alert(`Failed to save channel: ${error.message}`);
        }
    };
}

function closeAutoDetectModal() {
    const modal = document.getElementById('autoDetectModal');
    modal.classList.add('hidden');
    document.getElementById('autoDetectForm_modal').reset();
}

// Function to update channel headers
async function updateChannelHeaders(channelId) {
    try {
        // First get the channel data
        const channelResponse = await fetch(`${API_BASE_URL}/api/channels/${channelId}`);
        if (!channelResponse.ok) {
            throw new Error(`Failed to fetch channel: ${channelResponse.statusText}`);
        }
        const channel = await channelResponse.json();
        
        if (!channel.website_url) {
            throw new Error('No website URL available for auto-update. Please edit the channel and add a website URL.');
        }

        const response = await fetch(`${API_BASE_URL}/api/auto-detect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: channel.website_url })
        });

        if (!response.ok) {
            throw new Error('Failed to auto-detect headers');
        }

        const data = await response.json();
        
        // Update channel with new headers
        const updateResponse = await fetch(`${API_BASE_URL}/api/channels/${channelId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...channel,
                user_agent: data.headers.userAgent || channel.user_agent,
                referer: data.headers.referer || channel.referer,
                origin: data.headers.origin || channel.origin,
                last_update: new Date().toISOString()
            })
        });

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(errorData.error || 'Failed to update channel');
        }

        // Reload the channels list to show updated data
        await loadChannels();
        
        console.log(`Updated headers for channel ${channelId}`);
    } catch (error) {
        console.error(`Error updating headers for channel ${channelId}:`, error);
        alert(`Failed to update headers: ${error.message}`);
    }
}

// Start auto-update interval checker
setInterval(async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/channels`);
        const channels = await response.json();
        
        const now = new Date();
        channels.forEach(channel => {
            if (channel.auto_update_enabled) {
                const lastUpdate = channel.last_update ? new Date(channel.last_update) : new Date(0);
                const intervalMs = (channel.auto_update_interval || 12) * 3600000; // Convert hours to milliseconds
                
                if (now - lastUpdate >= intervalMs) {
                    updateChannelHeaders(channel.id);
                }
            }
        });
    } catch (error) {
        console.error('Error checking for channels to update:', error);
    }
}, 60000); // Check every minute 

// Add the redetectHeaders function
async function redetectHeaders() {
    const websiteUrl = document.getElementById('modal_website_url').value;
    if (!websiteUrl) {
        alert('Please enter a website URL first');
        return;
    }

    const button = document.querySelector('button[onclick="redetectHeaders()"]');
    const originalContent = button.innerHTML;
    button.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auto-detect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: websiteUrl })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to auto-detect stream');
        }

        const data = await response.json();
        
        // Update the form fields with new data
        document.getElementById('modal_m3u_url').value = data.m3uUrl;
        document.getElementById('modal_user_agent').value = data.headers.userAgent || '';
        document.getElementById('modal_referer').value = data.headers.referer || '';
        document.getElementById('modal_origin').value = data.headers.origin || '';

        // Update stream type indicator
        const streamTypeIndicator = document.getElementById('stream_type_indicator');
        if (streamTypeIndicator) {
            const isHLS = data.m3uUrl.endsWith('.m3u8');
            streamTypeIndicator.textContent = isHLS ? 'HLS Stream (.m3u8)' : 'M3U Stream';
            streamTypeIndicator.className = isHLS ? 
                'text-sm text-green-600 font-medium' : 
                'text-sm text-blue-600 font-medium';
        }

        alert('Headers successfully updated!');
    } catch (error) {
        console.error('Error re-detecting headers:', error);
        alert(error.message);
    } finally {
        button.innerHTML = originalContent;
        button.disabled = false;
    }
}

// Add the resequenceChannels function
async function resequenceChannels() {
    if (!confirm('This will reorder all channel IDs sequentially. Continue?')) {
        return;
    }

    const button = document.querySelector('button[onclick="resequenceChannels()"]');
    const originalContent = button.innerHTML;
    button.innerHTML = `
        <svg class="w-4 h-4 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Resequencing...
    `;
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/channels/resequence`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to resequence channel IDs');
        }

        await loadChannels();
        alert('Channel IDs resequenced successfully!');
    } catch (error) {
        console.error('Error resequencing channel IDs:', error);
        alert(error.message);
    } finally {
        button.innerHTML = originalContent;
        button.disabled = false;
    }
}

function setupUpdateIntervalHandlers() {
    const daysSelect = document.getElementById('modal_update_days');
    const hoursSelect = document.getElementById('modal_update_hours');
    
    if (!daysSelect || !hoursSelect) return;

    // Initial check
    if (parseInt(daysSelect.value) === 7) {
        hoursSelect.value = '0';
        hoursSelect.disabled = true;
    }

    // Add change handler
    daysSelect.addEventListener('change', function() {
        const days = parseInt(this.value);
        if (days === 7) {
            hoursSelect.value = '0';
            hoursSelect.disabled = true;
        } else {
            hoursSelect.disabled = false;
            // Ensure total hours don't exceed 168
            const currentHours = parseInt(hoursSelect.value);
            const totalHours = (days * 24) + currentHours;
            if (totalHours > 168) {
                hoursSelect.value = '0';
            }
        }
    });

    // Add change handler for hours to prevent exceeding 168 hours
    hoursSelect.addEventListener('change', function() {
        const days = parseInt(daysSelect.value);
        const hours = parseInt(this.value);
        const totalHours = (days * 24) + hours;
        if (totalHours > 168) {
            this.value = '0';
        }
    });
}

// Function to toggle all channel checkboxes
function toggleAllChannels() {
    const selectAllCheckbox = document.getElementById('selectAllChannels');
    const channelCheckboxes = document.querySelectorAll('.channel-checkbox');
    channelCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
}

// Function to update selected channels
async function updateSelectedChannels() {
    const selectedCheckboxes = document.querySelectorAll('.channel-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one channel to update');
        return;
    }

    const updateButton = document.getElementById('updateSelectedButton');
    const originalContent = updateButton.innerHTML;
    updateButton.innerHTML = `
        <svg class="w-4 h-4 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Updating...
    `;
    updateButton.disabled = true;

    try {
        const updatePromises = Array.from(selectedCheckboxes).map(checkbox => {
            const channelId = checkbox.dataset.channelId;
            return updateChannelHeaders(channelId);
        });

        await Promise.all(updatePromises);
        alert('Selected channels updated successfully!');
    } catch (error) {
        console.error('Error updating selected channels:', error);
        alert('Failed to update some channels. Please check the console for details.');
    } finally {
        updateButton.innerHTML = originalContent;
        updateButton.disabled = false;
    }
} 