function enchancePage() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);


  // sticky post buttons
  if (document.getElementById("iveltHelperSettings").getAttribute("data-sticky-post-buttons") === "true") {

    window.addEventListener('scroll', function() {
      const postButtons = document.querySelectorAll('.has-profile .post-buttons');

      postButtons.forEach((btn,ind) => {
        if (btn.parentElement.getBoundingClientRect().top < -20) {
          btn.classList.add('sticky-post');
        } else {
          btn.classList.remove('sticky-post');
        }
      });
    });
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
