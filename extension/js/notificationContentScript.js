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
});