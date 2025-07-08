chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "fetchNotifications") {
        console.log("Content script received request to fetch notifications.");
        // Mark the response as asynchronous
        (async () => { // Use an IIFE or define an async function inside
            try {
                // Perform the fetch from the content script, in the page's context
                const response = await fetch("https://www.ivelt.com/forum/ucp.php?i=ucp_notifications");
                const data = await response.text();

                let matches =
                    data.match(/id="notification_list_button"\D*(\d{1,4})/) || [];
                let newCount = matches.length === 2 ? matches[1] : "0";

                console.log("Content script fetched newCount:", newCount);

                // Call sendResponse with your data
                sendResponse({ newCount: newCount, data: data });
            } catch (error) {
                console.error("Content script fetch error:", error);
                // Always call sendResponse, even on error
                sendResponse({ newCount: "0", error: error.message });
            }
        })();
        return true; // Important: Indicates that you will send a response asynchronously
    }
});