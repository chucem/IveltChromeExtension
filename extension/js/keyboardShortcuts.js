function previousPage() {
	document.querySelectorAll(".previous a")[0].click();
}

function nextPage() {
	document.querySelectorAll(".next a")[0].click();
}

function scrollTop() {
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollBottom() {
	window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' } );
}

function sendPost(post) {
	if (post) {
		post.click();
	}
}

function previewPost() {
	document.getElementsByName("preview")[0].click();
}

function toggleNotification() {
	const notificationNode = document.getElementById("notification_list_button");
	if (notificationNode) {
		notificationNode.click();
	}
}

function checkKey(e) {
	if (e.code == "KeyA" && e.altKey) {
		window.location.href = 'https://www.ivelt.com/forum/search.php?search_id=active_topics';
	}

	if (e.key == "Enter" && e.ctrlKey && post) {
		sendPost(post);
	}

	if (e.code == "KeyV" && e.altKey && post) {
		previewPost();
	}

	if (e.code == "KeyN" && e.altKey) {
		toggleNotification();
	}

	e = e || window.event;

	if (e.target.nodeName == "INPUT" || e.target.nodeName == "TEXTAREA") return;
	if (e.target.isContentEditable) return;

	if (e.key == "ArrowLeft") {
		try {
			nextPage();
		} catch {
			console.log("attempted to go after last page");
		}
	} else if (e.key == "ArrowRight") {
		try {
			previousPage();
		} catch {
			console.log("attempted to go before first page");
		}
	} else if (e.key == "ArrowUp") {
		scrollTop();
	} else if (e.key == "ArrowDown") {
		scrollBottom();
	}
}

let post = document.getElementsByName("post")[0] || document.getElementsByName("submit")[0] || false;
if (post) {
	post.setAttribute("title", "שיק (שארטקאט קאנטראל+ענטער)");
}
document.onkeydown = checkKey;
