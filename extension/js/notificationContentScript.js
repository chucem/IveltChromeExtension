// Mark that this script is injected
window.iveltNotificationScriptInjected = true;



const PAGE_SIZE = 50;  // Adjust based on what ivelt uses (check the # of notifications per page)
const UCP_BASE_URL = "https://www.ivelt.com/forum/ucp.php?i=ucp_notifications&mode=notification_list";

function parseNotificationPage(html) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();

    const rows = wrapper.querySelectorAll("li.row");

    return Array.from(rows).map(li => {
        const avatarElement = li.querySelector(".avatar") || li.querySelector("img");
        const avatar = avatarElement?.getAttribute("data-src") || avatarElement?.getAttribute("src") || null;

        const titleEl = li.querySelector(".notifications_title");
        let fullTitleHTML = "";
        let threadTitle = "";
        let actionType = "נאטיפיקאציע";

        if (titleEl) {
            const clone = titleEl.cloneNode(true);

            // Get action type
            const strong = clone.querySelector("strong");
            if (strong) actionType = strong.textContent.trim();

            // Get full text
            const fullText = titleEl.textContent.trim();

            // Find last username span
            const usernameSpans = clone.querySelectorAll("span.username");
            let afterUserText = "";

            if (usernameSpans.length) {
                const lastUser = usernameSpans[usernameSpans.length - 1];
                const usernameText = lastUser.textContent.trim();
                const split = fullText.split(usernameText);
                afterUserText = split.length > 1 ? split.pop().trim() : '';
            }

            // Find the first ":" after the usernames
            const colonIndex = afterUserText.indexOf(":");
            if (colonIndex !== -1) {
                threadTitle = afterUserText.slice(colonIndex + 1).trim();

                // Truncate HTML up to that colon
                let foundText = "";
                const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null);
                while (walker.nextNode()) {
                    const node = walker.currentNode;
                    foundText += node.textContent;
                    if (foundText.includes(":")) {
                        const cutAt = node.textContent.indexOf(":") + 1;
                        node.textContent = node.textContent.slice(0, cutAt);
                        break;
                    }
                }

                // Remove all nodes after the cut
                let seenColon = false;
                clone.childNodes.forEach((node, i) => {
                    if (seenColon) {
                        clone.removeChild(node);
                        return;
                    }
                    if (node.textContent?.includes(":")) seenColon = true;
                });

                fullTitleHTML = clone.innerHTML.trim();
            } else {
                // fallback
                fullTitleHTML = clone.innerHTML.trim();
                threadTitle = '';
            }
        }

        const timestamp = li.querySelector(".notifications_time")?.textContent.trim() || null;
        const notificationId = li.querySelector("input[name='mark[]']")?.value || null;
        const link = li.querySelector("a[href*='mark_notification']")?.getAttribute("href") || null;
        const isUnread = li.classList.contains("unread") || li.classList.contains("bg3");

        return {
            avatar,
            title: fullTitleHTML,
            threadTitle,
            actionType,
            timestamp,
            notificationId,
            link,
            isUnread
        };
    });
}

async function fetchNewNotificationsWithPagination() {
    // Load stored unread notifications
    let storedUnread = JSON.parse(localStorage.getItem('storedUnreadNotifications') || '[]');
    const storedUnreadIds = new Set(storedUnread.map(n => n.notificationId));

    const isFreshRun = storedUnread.length === 0;

    const foundStoredUnreadIds = new Set();
    let allFetchedUnread = [];

    let start = 0;

    while (true) {
        const url = `${UCP_BASE_URL}&start=${start}`;
        console.log(`Fetching notifications from: ${url}`);

        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
            console.warn(`Failed to fetch page at start=${start}: ${response.status}`);
            break;
        }

        const html = await response.text();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;

        const notificationList = wrapper.querySelector("#page-body .notification_list");
        if (!notificationList) break;

        const notifications = parseNotificationPage(notificationList.innerHTML);
        if (notifications.length === 0) break;

        // Process all notifications
        notifications.forEach(n => {
            if (storedUnreadIds.has(n.notificationId)) {
                foundStoredUnreadIds.add(n.notificationId);
            }

            // Keep only unread ones for storage
            if (n.isUnread) {
                allFetchedUnread.push(n);
            }
        });

        const allMatched = isFreshRun ? false : storedUnreadIds.size === foundStoredUnreadIds.size;
        const noMorePages = notifications.length < PAGE_SIZE;

        if (allMatched || noMorePages) break;

        start += PAGE_SIZE;
    }

    // Save only current unread notifications
    localStorage.setItem('storedUnreadNotifications', JSON.stringify(allFetchedUnread));

    return allFetchedUnread;
}


function addAllNotifications(notifications){

    //  function to add/update notification count and badge
    function updateNotificationCountAndBadge(count, id) {
        const badge = document.querySelector(getID(id) + "_button .badge");
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? "inline-block" : "none";
        }
    }

    function addNotificationToDropdown(notificationLi, id) {
        const ul = document.querySelector(getID(id) + " ul");
        if (ul) ul.appendChild(notificationLi);
    }

    function clearDropdown(id) {
        const ul = document.querySelector(getID(id) + " ul");
        if (ul) ul.innerHTML = "";
    }

    function getID(baseId){
        return baseId && baseId !== 'leftover' ? `#${baseId}_notification_list` : '#notification_list';
    }


    // Mapping from actionType to dropdown ID
    const filtersMap = {
        'באדאנקט': 'badankt',
        'דערמאנט': 'dermant',
        'ציטירט': 'citirt'
    };

    const counts = {
        badankt: 0,
        dermant: 0,
        citirt: 0,
        leftover: 0
    };

    // Clear all known dropdowns
    Object.values(filtersMap).forEach(id => clearDropdown(id));
    clearDropdown(null); // Fallback dropdown (if needed)

    notifications.forEach(notification => {
        const li = buildNotificationDropdownItem(notification);
        const baseId = filtersMap[notification.actionType] || null;
        addNotificationToDropdown(li, baseId);
        const key = filtersMap[notification.actionType] || 'leftover';
        counts[key]++;
    });

    // for all counts update the badgre
    Object.entries(counts).forEach(([id, count]) => {
        updateNotificationCountAndBadge(count, id);
    });


}


function createNotificationBellOnlyMenus() {
    const originalLI = document.querySelector('#notification_list')?.closest('li');
    if (!originalLI) return;

    // Helper to create empty notification bell menu
    function createNotificationBell(type, label, iconClass) {
        const li = originalLI.cloneNode(true);
        li.id = `${type}_notification_item`;
        li.classList.add('notif-bell');

        // Update the link and badge
        const link = li.querySelector('a.dropdown-trigger');
        if (link) {
            link.id = `${type}_notification_list_button`;
            link.href = '#';

            // Update icon
            const icon = link.querySelector('i.icon');
            if (icon) {
                icon.className = `icon ${iconClass} fa-fw`;
            }

            // Update label
            const labelSpan = link.querySelector('span');
            if (labelSpan) {
                labelSpan.textContent = label;
            }

            // Remove badge since count is unknown here (optional)
            const badge = link.querySelector('strong.badge');
            badge.textContent = '';
            badge.style.display = 'none';
        }

        // Update dropdown container
        const dropdown = li.querySelector('.dropdown-extended');
        if (dropdown) {
            dropdown.id = `${type}_notification_list`;

            // Update header text
            const header = dropdown.querySelector('.header');
            if (header) {
                header.textContent = label;
            }

            // Clear the dropdown UL so it’s empty for now
            const ul = dropdown.querySelector('ul');
            if (ul) {
                ul.innerHTML = '';
            }

            // Update footer link
            const footerLink = dropdown.querySelector('.footer a');
            if (footerLink) {
                footerLink.href = "./ucp.php?i=ucp_notifications";
                footerLink.textContent = "צייג אלע";
            }

            // Setup click to toggle dropdown display
            if (link) {
                link.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.querySelectorAll('.dropdown-extended').forEach(el => {
                        if (el !== dropdown) el.style.display = 'none';
                    });
                    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                });
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', e => {
            if (!li.contains(e.target)) {
                const dropdown = li.querySelector('.dropdown-extended');
                if (dropdown) dropdown.style.display = 'none';
            }
        });

        return li;
    }

    // Create empty notification menus
    const badanktLI = createNotificationBell('badankt', 'באדאנקט', 'fa-thumbs-up');
    const dermantLI = createNotificationBell('dermant', 'דערמאנט', 'fa-at');
    const citirtLI = createNotificationBell('citirt', 'ציטירט', 'fa-quote-left');

    const parent = originalLI.parentElement;
    if (parent) {
        // Insert the new notification bells to the left of the original bell
        [badanktLI, dermantLI, citirtLI].filter(Boolean).forEach(bell => {
            parent.insertBefore(bell, originalLI);
        });
    }
}

function buildNotificationDropdownItem(notification) {
    const {
        avatar,
        title,
        threadTitle,
        timestamp,
        link,
    } = notification;

    const li = document.createElement("li");
    li.className = "bg2";

    // --- Notification Block Link ---
    const aBlock = document.createElement("a");
    aBlock.className = "notification-block";
    aBlock.href = link;
    aBlock.setAttribute("data-real-url", "#");

    const img = document.createElement("img");
    img.src = avatar;
    img.alt = "";

    const notificationText = document.createElement("div");
    notificationText.className = "notification_text";

    const pTitle = document.createElement("p");
    pTitle.className = "notification-title";
    pTitle.innerHTML = `${title}`;

    const pRef = document.createElement("p");
    pRef.className = "notification-reference";
    pRef.textContent = threadTitle;

    const pTime = document.createElement("p");
    pTime.className = "notification-time";
    pTime.textContent = timestamp;

    // assemble the text block
    notificationText.appendChild(pTitle);
    notificationText.appendChild(pRef);
    notificationText.appendChild(pTime);

    aBlock.appendChild(img);
    aBlock.appendChild(notificationText);
    li.appendChild(aBlock);

    // --- Mark as Read Link ---
    const aMark = document.createElement("a");
    aMark.href = link;
    aMark.className = "mark_read icon-mark";
    aMark.setAttribute("data-ajax", "notification.mark_read");
    aMark.title = "פארצייכן אלס געליינט";
    aMark.style.cursor = "pointer";

    const icon = document.createElement("i");
    icon.className = "icon fa-check-circle icon-xl fa-fw";
    icon.setAttribute("aria-hidden", "true");

    const spanSr = document.createElement("span");
    spanSr.className = "sr-only";
    spanSr.textContent = "פארצייכן אלס געליינט";

    aMark.appendChild(icon);
    aMark.appendChild(spanSr);
    li.appendChild(aMark);

    // --- Add click event to mark as read ---
    aMark.addEventListener("click", async (e) => {
        e.preventDefault();
        if (li.dataset.marking === "true") return;

        li.dataset.marking = "true";
        li.style.opacity = "0.6";
        li.style.pointerEvents = "none";
        li.style.transition = "opacity 0.3s ease";

        try {
            const response = await fetch(link, {
                method: "GET",
                credentials: "include"
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            li.style.transition = "opacity 0.4s ease";
            li.style.opacity = "0";

            setTimeout(() => {
                if (li.parentNode) li.parentNode.removeChild(li);
            }, 400);
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
            alert("Failed to mark as read. Please try again.");

            li.dataset.marking = "false";
            li.style.opacity = "";
            li.style.pointerEvents = "";
            li.style.transition = "";
        }
    });

    return li;
}

createNotificationBellOnlyMenus()


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "fetchNotifications") {
        console.log("Content script received request to fetch notifications.");
        
        // Mark the response as asynchronous
        (async () => {
            try {
                // Fetch notifications from the forum
                const unreadNotifications = await fetchNewNotificationsWithPagination()

                // Send back both the count and the full HTML for notifications
                sendResponse({ 
                    success: true,
                    data: unreadNotifications
                });
            } catch (error) {
                console.error("Error fetching notifications:", error);
                sendResponse({ 
                    success: false,
                    error: error.message
                });
            }
        })();
        
        // Return true to indicate we'll respond asynchronously
        return true;
    }
    else if (request.type === "notificationsUpdated") {
        console.log("Content script received request to update notifications.");
        const updatedNotifications = request.data;

        console.log(updatedNotifications);
        addAllNotifications(updatedNotifications);

    }
});