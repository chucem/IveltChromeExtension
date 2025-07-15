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

chrome.runtime.onMessage.addListener( function (message, sender, sendResponse) {
    if (message.type === "notificationsUpdated") {
        console.log("Content script received request to update notifications.");
        const updatedNotifications = message.data;

        console.log(updatedNotifications);
        addAllNotifications(updatedNotifications);

        // Return true to indicate we'll respond asynchronously
        return true;
    }
});

