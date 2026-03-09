function splitNotifications() {
    const originalLI = document.querySelector('#notification_list')?.closest('li');
    if (!originalLI) return;

    const allItems = Array.from(document.querySelectorAll('#notification_list ul li'));

    const matchType = (li, type) => {
      const title = li.querySelector('.notification-title')?.textContent.trim() || '';
      return title.startsWith(type);
    };

    const citirtItemsAll   = allItems.filter(li => matchType(li, 'ציטירט'));
    const badanktItemsAll  = allItems.filter(li => matchType(li, 'באדאנקט'));
    const dermantItemsAll  = allItems.filter(li => matchType(li, 'דערמאנט'));

    const isUnread = li => li.classList.contains('bg1') || li.classList.contains('bg2');

    const citirtCount  = citirtItemsAll.filter(isUnread).length;
    const badanktCount = badanktItemsAll.filter(isUnread).length;
    const dermantCount = dermantItemsAll.filter(isUnread).length;

    // Remove matched items from original list
    [...citirtItemsAll, ...badanktItemsAll, ...dermantItemsAll].forEach(li => li.remove());

    function createNotificationBell(type, label, count, items, iconClass) {
      // Clone the original notification LI
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

        // Update badge
        const badge = link.querySelector('strong.badge');
        if (badge) {
          if (count <= 0) {
            badge.remove();
          }
          badge.textContent = count;
        }
      }

      // Update dropdown
      const dropdown = li.querySelector('.dropdown-extended');
      if (dropdown) {
        dropdown.id = `${type}_notification_list`;

        // Update header
        const header = dropdown.querySelector('.header');
        if (header) {
          header.textContent = label;
        }

        // Move original items to the new dropdown
        const ul = dropdown.querySelector('ul');
        if (ul) {
          ul.innerHTML = '';
          items.forEach(item => ul.appendChild(item));
        }

        // Update footer link
        const footerLink = dropdown.querySelector('.footer a');
        if (footerLink) {
          footerLink.href = "./ucp.php?i=ucp_notifications";
          footerLink.textContent = "צייג אלע";
        }

        // Add click handlers
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
          dropdown.style.display = 'none';
        }
      });

      return li;
    }

    // Create notification bells by cloning the original
    const badanktLI = createNotificationBell('badankt', 'באדאנקט', badanktCount, badanktItemsAll, 'fa-thumbs-up');
    const dermantLI = createNotificationBell('dermant', 'דערמאנט', dermantCount, dermantItemsAll, 'fa-at');
    const citirtLI  = createNotificationBell('citirt', 'ציטירט', citirtCount, citirtItemsAll, 'fa-quote-left');

    // Insert the new notification bells to the left of the original bell
    const parent = originalLI.parentElement;
    if (parent) {
      // Insert in reverse order since we're adding to the left
      [badanktLI, dermantLI, citirtLI].filter(Boolean).forEach(bell => {
        parent.insertBefore(bell, originalLI);
      });
    }

    // Update original badge count
    const originalBadge = originalLI.querySelector('strong.badge');
    if (originalBadge) {
      const currentCount = parseInt(originalBadge.textContent.trim(), 10);
      const adjusted = currentCount - citirtCount - badanktCount - dermantCount;
      const newCount = adjusted > 0 ? adjusted : 0;

      if (newCount > 0) {
        originalBadge.textContent = newCount;
      } else {
        originalBadge.remove();
      }
    }
}

// splitNotifications();
if (document.getElementById("iveltHelperSettings").getAttribute("data-show-multi-notifs") === "true") {
  splitNotifications();
}