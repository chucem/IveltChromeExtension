function enchancePage() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);


// Sticky post buttons logic with logging
  if (document.getElementById("iveltHelperSettings").getAttribute("data-sticky-post-buttons") === "true") {
    const postButtons = document.querySelectorAll('.has-profile .post-buttons');

    const checkStickyPosition = () => {
      let firstStickyFound = false;

      postButtons.forEach(btn => {
        const parent = btn.parentElement;

        const parentRect = parent.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        // Add or remove the sticky-post class based on the parent's top position
        if (parentRect.top < 0 && parentRect.bottom > 30 && !firstStickyFound) {
          firstStickyFound = true;
          // console.log(`found button set to stick. the parent.bottom is ${parentRect.bottom}, the parentRect.top is ${parentRect.top} `);

          if (!btn.classList.contains('sticky-post')) {
            // console.log(`Adding 'sticky-post' to`, i);
            btn.style.left = `${btnRect.left}px`; // Keep the original X position
            btn.classList.add('sticky-post');
          }
        } else {
          if (btn.classList.contains('sticky-post')) {
            // console.log(`Removing 'sticky-post' from`, i);
            btn.classList.remove('sticky-post');
            btn.style.left = '';
          }
        }
      });
    };

    window.addEventListener('scroll', checkStickyPosition); // 100ms debounce delay
    checkStickyPosition();
  }
  // Only run on Topic page
  if (url.pathname === "/forum/viewtopic.php"){
    // Duplicate link for "Unread Post" to bottom of page.
    const paginations = document.getElementsByClassName("pagination");
    paginations[1].outerHTML = paginations[0].outerHTML;
  }

  if (url.pathname === "/forum/ucp.php" && params.get('i') === 'ucp_notifications'){
    const pagination = document.querySelector(".action-bar.bar-top .pagination");

    const link = document.createElement("a");
    // add listened
    link.setAttribute("href", "javascript:void(0);");
    link.id = "ext-hide-read"
    link.innerText = "באהאלט די געליינטע";
    link.addEventListener('click', function (event) {
      document.querySelectorAll('li.row.bg1, li.row.bg2').forEach(e => e.style.display = (e.style.display === "none") ? "" : "none");

      if (event.currentTarget.id === "ext-hide-read"){
        event.currentTarget.innerText = "ווייז די געליינטע";
        event.currentTarget.id = "ext-show-read";
      } else {
        event.currentTarget.innerText = "באהאלט די געליינטע";
        event.currentTarget.id = "ext-hide-read";
      }

    });

    const linkWrap = document.createElement("span");
    linkWrap.innerText = " • ";
    linkWrap.insertBefore(link, linkWrap.firstChild);

    pagination.insertBefore(linkWrap, pagination.firstChild);
  }

}

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

    // Update original badge count
    const originalBadge = originalLI.querySelector('strong.badge');
    if (originalBadge) {
      const currentCount = parseInt(originalBadge.textContent.trim(), 10);
      const adjusted = currentCount - citirtCount - badanktCount - dermantCount;
      originalBadge.textContent = adjusted >= 0 ? adjusted : 0;
    }

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
            badge.style.backgroundColor = '#999';
            badge.style.color = '#fff';
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

        // Clear and repopulate items
        const ul = dropdown.querySelector('ul');
        if (ul) {
          ul.innerHTML = '';
          items.forEach(item => ul.appendChild(item.cloneNode(true)));
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
}

enchancePage();
splitNotifications();