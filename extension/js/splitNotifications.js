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
    // Private messages go to the forum's own PM icon (with its own count of unread messages), when
    // it's there, instead of being among the general notifications
    const pmLink = [...originalLI.parentElement.querySelectorAll(':scope > li > a')]
      .find(a => /[?&]i=pm\b/.test(a.getAttribute('href') || '') && /folder=inbox/.test(a.getAttribute('href')));
    const pmItemsAll       = pmLink ? allItems.filter(li => matchType(li, 'פריוואטע מעסעדזש')) : [];

    const isUnread = li => li.classList.contains('bg1') || li.classList.contains('bg2');

    const citirtCount  = citirtItemsAll.filter(isUnread).length;
    const badanktCount = badanktItemsAll.filter(isUnread).length;
    const dermantCount = dermantItemsAll.filter(isUnread).length;
    const pmCount      = pmItemsAll.filter(isUnread).length;

    // A copy of the original bell's dropdown, with these items in it
    const originalDropdown = originalLI.querySelector('.dropdown-extended').cloneNode(true);

    // Remove matched items from original list
    [...citirtItemsAll, ...badanktItemsAll, ...dermantItemsAll, ...pmItemsAll].forEach(li => li.remove());

    function createDropdown(type, label, items, footerHref, footerText) {
      const dropdown = originalDropdown.cloneNode(true);
      dropdown.id = `${type}_notification_list`;
      // Not whatever position phpBB had set on the original when it was copied
      dropdown.removeAttribute('style');
      // so the pinned first post isn't drawn over them
      dropdown.style.zIndex = '1000';

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
        // phpBB sizes the dropdown to what's in it, so an empty one was just a sliver
        if (!items.length) {
          const empty = document.createElement('li');
          empty.className = 'no_notifications';
          empty.textContent = 'נישטא קיין נאטיפיקאציעס';
          ul.appendChild(empty);
        }
      }

      // Update footer link
      const footerLink = dropdown.querySelector('.footer a');
      if (footerLink) {
        footerLink.href = footerHref;
        footerLink.textContent = footerText;
      }

      return dropdown;
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
            badge.remove();
          }
          badge.textContent = count;
        }
      }

      // Update dropdown
      const dropdown = createDropdown(type, label, items, './ucp.php?i=ucp_notifications', 'ווייז אלע');
      li.querySelector('.dropdown-extended').replaceWith(dropdown);

      // Opened and closed by phpBB's own dropdown code, like the original bell: it keeps the
      // dropdown on screen (on a phone the bells are near the left edge) and closes it on a
      // click elsewhere
      if (link) registerDropdown(link, dropdown);

      return li;
    }

    function registerDropdown(link, dropdown) {
      if (!window.jQuery || !window.phpbb || !phpbb.registerDropdown) return;
      // After phpBB's own ready handlers, which register every dropdown already on the page (maybe
      // these too, when this ran first), so each is registered once
      jQuery(() => setTimeout(() => {
        if (!jQuery(link).data('dropdown-options'))
          phpbb.registerDropdown(jQuery(link), jQuery(dropdown), { direction: 'auto', verticalDirection: 'auto' });
      }));
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

    // The PM icon opens the private messages, the footer goes to the inbox
    if (pmLink) {
      const pmLI = pmLink.parentElement;
      const dropdown = createDropdown('pm', 'פריוואטע מעסעדזשעס', pmItemsAll, pmLink.getAttribute('href'), 'גיי צום פאסט קעסטל');
      pmLI.classList.add('dropdown-container', 'notif-bell');
      pmLI.id = 'pm_notification_item';
      pmLink.classList.add('dropdown-trigger');
      pmLink.id = 'pm_notification_list_button';
      pmLI.appendChild(dropdown);
      registerDropdown(pmLink, dropdown);
    }

    // Update original badge count
    const originalBadge = originalLI.querySelector('strong.badge');
    if (originalBadge) {
      const currentCount = parseInt(originalBadge.textContent.trim(), 10);
      const adjusted = currentCount - citirtCount - badanktCount - dermantCount - pmCount;
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