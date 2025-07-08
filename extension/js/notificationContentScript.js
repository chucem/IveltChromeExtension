// Mark that this script is injected
window.iveltNotificationScriptInjected = true;

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "fetchNotifications") {
        console.log("Content script received request to fetch notifications.");
        
        // Mark the response as asynchronous
        (async () => {
            try {
                // Fetch notifications from the forum
                const response = await fetch("https://www.ivelt.com/forum/ucp.php?i=ucp_notifications");
                const data = await response.text();

                // Parse the notification count
                const matches = data.match(/id="notification_list_button"\D*(\d{1,4})/) || [];
                const newCount = matches.length === 2 ? matches[1] : "0";

                console.log("Content script fetched newCount:", newCount);
                
                // Send back both the count and the full HTML for notifications
                sendResponse({ 
                    success: true,
                    newCount: newCount, 
                    data: data 
                });
            } catch (error) {
                console.error("Error fetching notifications:", error);
                sendResponse({ 
                    success: false, 
                    newCount: "0", 
                    error: error.message 
                });
            }
        })();
        
        // Return true to indicate we'll respond asynchronously
        return true;
    }
});