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

enchancePage();