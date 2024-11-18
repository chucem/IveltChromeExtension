function createButton(reference, customClass, title, text, onclick, itext="") {
    let li = document.createElement('li');
    let a = document.createElement('a');
    let span = document.createElement('span');
    let i = document.createElement('i');
    //let img = document.createElement('img');
    //img.setAttribute('src', `https://www.ivelt.com/kfmdm/resources/drawable/${icon}`)
    if (reference){
        a.setAttribute('href', reference);
    }
    if (onclick){
        a.setAttribute('onClick', onclick)
    }
    a.setAttribute('class', 'button button-icon-only custom-btn ');
    // a.setAttribute('style', "width:18px;color:black;text-align:center;user-select:none;");
    a.setAttribute('title',title );
    a.style.background = '#ebeadd';
    i.setAttribute('class', `icon ${customClass} fa-fw`);
    i.setAttribute('aria-hidden', 'true');
    i.style.width = "auto";
    i.style.minWidth = "18px"
    i.innerText = itext;
    span.innerText = text;
    a.appendChild(i);
    a.appendChild(span);
    li.appendChild(a);

    return {li, a, span, i}
}

function getPMHref(id) {
    let pm_button = document.querySelector(`#profile${id.replace("post_content", "")} .pm-icon`)
    if (pm_button){
        return pm_button.parentElement;
    }
    return null;
}

function addBtn(){
    let onlyLastQuote = window.location.href.includes("last=true");
    if (onlyLastQuote) {
        let messageArea = document.querySelector("#message");
        let text = messageArea.innerHTML;
        if (hasNestedQuotes(text)) {
            text = removeNestedQuotes(text);
            messageArea.innerHTML = text;
        }
    }

    let btns = document.querySelectorAll('.post-buttons');
    let isPosting = (window.location.href.includes("posting.php"));
    var needUpdating = false;
    btns.forEach(btn => {
        // Check if custom buttons have been added already, if yes ignore.
        if(btn.getElementsByClassName('custom-btn').length > 0){
            return;
        }
        needUpdating = true
        btn.querySelectorAll('li.hidden:not(.responsive-menu)').forEach(b => {
            if (b.getAttribute('class') === "hidden"){
                b.removeAttribute('class')
            }
        })

        addUnderlineForQuoteBtn(btn);

       let contentElement = btn.parentElement.getElementsByClassName("content").item(0)
        let id = btn.parentElement.getAttribute("id") || ""
        let strippedId = id.replace("post_content", "")
        strippedId = strippedId.replace("pr", "")
        if (!isPosting){
            addCopyQuoteButton(btn, id.replace("post_content", ""))
        }
        let pingOnClick = `ping_user(${strippedId})`
        addSimpleButton(btn, null, 'fa-at', 'דערמאן תגובה', 'דערמאן תגובה', pingOnClick)
        if (contentElement.innerHTML.includes("blockquote")) {
            addQuoteLastButton(btn, isPosting);
        }

        // let responsiveMenu = btn.getElementsByClassName('responsive-menu').item(0);
        try {
            btn.removeChild(btn.getElementsByClassName('responsive-menu').item(0))
        } catch (e) {

        }
    });
    let navUpdate = addDefaultPage();
    if (needUpdating || navUpdate){
        let navBar = document.querySelector('#nav-footer');
        navBar.querySelectorAll('li.hidden:not(.responsive-menu)').forEach(si => {
            si.setAttribute('class', si.getAttribute('class').replace('hidden', ''))
        })
        navBar.removeChild(navBar.getElementsByClassName('responsive-menu').item(0))
        parseDocument($('body'));
    }
}

function addSimpleButton(btn, href, customClass, title, text, onclick, itext=""){
    let button = createButton(href, customClass, title, text, onclick, itext);

    let quoteLi = getQuoteElm(btn).parentElement;
    if (quoteLi){
        quoteLi.parentNode.insertBefore(button.li, quoteLi.nextSibling)
    }

}

function getQuoteElm(btn){

    const quoteButton = btn.querySelector('i.icon.fa-quote-left.fa-fw');

    if (quoteButton){
        const quoteUrl = quoteButton.parentElement;
        if (quoteUrl){
                return quoteUrl;
        }
    }

    return null;

}

function addUnderlineForQuoteBtn(btn) {
    let sourceURL = getQuoteElm(btn);
    sourceURL.style.background = '#ebeadd';
}

function addCopyQuoteButton(btn, postID){
    let sourceURL = getPMHref(postID) || getQuoteElm(btn)
    addSimpleButton(btn, null, 'fa-copy', 'ציטיר אין אנדערע אשכול', 'ציטיר אין אנדערע אשכול',
        sourceURL?
            `copyQuote("${sourceURL.getAttribute("href")}", "${postID}")`:
            `copyQuoteParse("${postID}")`
    )
}

function addQuoteLastButton(btn, isPosting) {

    let quoteElm = getQuoteElm(btn)
    if (!quoteElm){
        return;
    }

    addSimpleButton(btn, `${quoteElm.getAttribute('href')}&last=true`, 'fa-quote-left last', 'ציטיר בלויז די לעצטע תגובה', 'ציטיר לעצטע',
        isPosting? `last${quoteElm.getAttribute('onclick')}`: null, '1');
}


function addDefaultPage(){
    if (document.querySelector(`#kf-app-default-page`)){
        return false
    }
    let li = document.createElement("li")
    let a = document.createElement('a');
    li.appendChild(a)
    li.setAttribute("class", "rightside")
    li.setAttribute("id", "kf-app-default-page")
    a.setAttribute('onClick', "saveDefaultPage()")
    a.innerText = "מאך די בלאט די דיפאולט בלאט"
    let pagination = document.querySelectorAll("#nav-footer").item(0)
    if (pagination){
        pagination.insertBefore(li, pagination.firstChild);
        return true;
    }
    return false;
}

function getPostLink(postID){
    return `https://www.ivelt.com/forum/viewtopic.php?p=${postID}#p${postID}`;
}

function copyQuoteParse(post_id){
    var html = document.querySelector(`#post_content${post_id} .content`).innerHTML
    let post_url = getPostLink(post_id)
    var username = getUsername(post_id)
    let converter = new HTML2BBCode();
    html = html.replaceAll("./download", "www.ivelt.com/forum/download")
    navigator.clipboard.writeText(`[quote="${username}"]${converter.feed(html)} [/quote] [url=${post_url}]מקור[/url]`)
}

function getPostDetails(post_id, prefix = 'p'){
    const usernameElm = document.querySelector(`#${prefix}${post_id} .username`) ||
        document.querySelector(`#${prefix}${post_id} .username-coloured`);

    const username = usernameElm ? usernameElm.innerText : "";
    const usernameLink = usernameElm ? usernameElm.href : "";
    const userId = usernameLink ? usernameLink.split("u=")[1] : "";


    let postTimestampElm = document.querySelector(`#${prefix}${post_id} time`);
    let postTime;

    if (!postTimestampElm){
        const tsExtractor = document.querySelector(`#${prefix}${post_id} [href='#postingbox']`).getAttribute('onclick');
        if (postTimestampElm){
            postTime = tsExtractor ? tsExtractor.match('(?<=time:)(.*)(?=,user)')[0] : undefined;        }
    } else {
        postTime = Date.parse(postTimestampElm.dateTime) / 1000
    }

    return {
        "username": username,
        "id": userId,
        "time": postTime
    };
}

function ping_user(post_id){

    if (window.location.href.includes("posting.php")){
        let PostDetails = getPostDetails(post_id,"pr")
        let text = `[quote="${PostDetails.username}" user_id=${PostDetails.id} time=${PostDetails.time} post_id=${post_id}]\n[/quote]`
        insert_text(text)
    } else {
        let PostDetails = getPostDetails(post_id)
        let text = `[quote="${PostDetails.username}" user_id=${PostDetails.id} time=${PostDetails.time} post_id=${post_id}]\n[/quote]`

        if (document.getElementById("iveltHelperSettings").getAttribute("data-always-copy-topic") == "true"){
            navigator.clipboard.writeText(text)
            iveltNotify("קאפירט צום קליפבאורד")
        } else {
            addText(text)
        }

    }
}

function addText(text){
    var textarea = document.querySelector("#message-box textarea");

    if (!isNaN(textarea.selectionStart)) {
    	var sel_start = textarea.selectionStart;
    	var sel_end = textarea.selectionEnd;
    	mozWrapApp(textarea, text, '');
    	textarea.selectionStart = sel_start + text.length;
    	textarea.selectionEnd = sel_end + text.length;
    } else if (textarea.createTextRange && textarea.caretPos) {
    	if (baseHeight !== textarea.caretPos.boundingHeight) {
    		textarea.focus();
    		storeCaret(textarea);
    	}
    	var caret_pos = textarea.caretPos;
    	caret_pos.text = caret_pos.text.charAt(caret_pos.text.length - 1) === ' ' ? caret_pos.text + text + ' ' : caret_pos.text + text;
    } else {
    	textarea.value = textarea.value + text;
    }
    textarea.focus();
}
function mozWrapApp(txtarea, open, close) {
	var selLength = (typeof(txtarea.textLength) === 'undefined') ? txtarea.value.length : txtarea.textLength;
	var selStart = txtarea.selectionStart;
	var selEnd = txtarea.selectionEnd;
	var scrollTop = txtarea.scrollTop;

	var s1 = (txtarea.value).substring(0,selStart);
	var s2 = (txtarea.value).substring(selStart, selEnd);
	var s3 = (txtarea.value).substring(selEnd, selLength);

	txtarea.value = s1 + open + s2 + close + s3;
	txtarea.selectionStart = selStart + open.length;
	txtarea.selectionEnd = selEnd + open.length;
	txtarea.focus();
	txtarea.scrollTop = scrollTop;

}

function hasNestedQuotes(text) {
    let firstQ = text.indexOf("[quote");
    if (firstQ === -1) {
        return false;
    }
    let secondQ = text.indexOf("[quote", firstQ + 1);
    return secondQ !== -1;

}

function removeNestedQuotes(text) {
    let nestedQuote = text.substring(
        text.lastIndexOf('[quote'),
        text.indexOf("[/quote]", text.lastIndexOf('[quote')) + 9
    );
    let modifiedText = text.replace(nestedQuote, "");

    if (hasNestedQuotes(modifiedText)) {
        return removeNestedQuotes(modifiedText);
    }

    return modifiedText;
}


function lastaddquote(post_id, username) {
    let messageName= 'message_' + post_id;
    let theSelection = '';
    let divArea = document.getElementById(messageName);

    if (divArea.innerHTML) {
        theSelection = divArea.innerHTML.replace(/<br>/ig, '\n');
        theSelection = theSelection.replace(/<br\/>/ig, '\n');
        theSelection = theSelection.replace(/&lt\;/ig, '<');
        theSelection = theSelection.replace(/&gt\;/ig, '>');
        theSelection = theSelection.replace(/&amp\;/ig, '&');
        theSelection = theSelection.replace(/&nbsp\;/ig, ' ');
    }  else if (divArea.textContent) {
        theSelection = divArea.textContent;
    } else if (divArea.firstChild.nodeValue) {
        theSelection = divArea.firstChild.nodeValue;
    }

    if (theSelection) {
        let text = '[quote="' + username + '"]' + theSelection + '[/quote]'
        insert_text(removeNestedQuotes(text));
    }

}

function copyQuote(url, post_id){
    let post_url = getPostLink(post_id)
    fetch(url).then(
        response => {
            return response.text();
        }).then( data =>{
            var parser = new DOMParser();
            var doc = parser.parseFromString(data, "text/html");
            var res = doc.querySelector("#message-box #message").innerText
            if (url.toString().includes("posting.php")){
                res = `${res} [url=${post_url}]מקור[/url]`
            }
            navigator.clipboard.writeText(res)
            iveltNotify("קאפירט צום קליפבאורד")
        }
    )
}

function iveltNotify(message){

    let fadeTarget = document.querySelector('#ivelt-notify');
    if (!fadeTarget) {
        fadeTarget = document.createElement('div');
        fadeTarget.id = 'ivelt-notify';
        fadeTarget.style.position = "fixed";
        fadeTarget.style.top = "30%";
        fadeTarget.style.left = "50%";
        fadeTarget.style.zIndex = "9999"; // Keep this on top
        fadeTarget.style.background = "#eee";
        fadeTarget.style.textAlign = "center";
        fadeTarget.style.padding = "5px 25px 7px 25px";
        fadeTarget.style.transform = "translateX(-50%)";
        fadeTarget.style.borderLeft = "2px solid #999";
        fadeTarget.style.borderRight = "2px solid #999";
        fadeTarget.style.borderBottom = "2px solid #999";
        fadeTarget.style.borderBottomLeftRadius = "4px";
        fadeTarget.style.borderBottomRightRadius = "4px";
        fadeTarget.style.transition = "opacity 0.75s linear";
        fadeTarget.style.fontSize = "1rem";

        const container = document.querySelector('#page-body')
        container.insertBefore(fadeTarget, container.firstChild);
    }

    fadeTarget.style.opacity = "1";
    fadeTarget.innerHTML = message ;
    setTimeout(function() {
        fadeTarget.style.opacity = "0";
    }, 1500);
}



addBtn();








async function fetchTopicMapping() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/1bziJ_h6bIRBXFSBJHT3aBsb13-QrEnrSjjy_-IS3FFw/values/CommentMapping!A2:B?key=AIzaSyAOHbrFKQc9M0SZfy59KgQs1fGWWf8y0pY`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const mappings = {};

        data.values.forEach(row => {
            mappings[row[0]] = row[1];         });
        return mappings;
    } catch (error) {
        console.error("Error fetching topic mappings:", error);
        return null;
    }
}

function getCurrentTopicIdFromDOM() {
    const topicTitleElement = document.querySelector('.topic-title a');
    
    if (topicTitleElement) {
        const href = topicTitleElement.href;
        const match = href.match(/[?&]t=(\d+)/);
        
        if (match) {
            return match[1];
        }
    }
    
    return null;
}

function addQuoteInOtherTopicButton(btn, postID, topicMapping) {
    const currentTopicId = getCurrentTopicIdFromDOM();
    
    if (!currentTopicId) {
        console.error("Unable to determine the current topic ID.");
        return;
    }

    const targetTopicId = topicMapping[currentTopicId];
    
    if (!targetTopicId) {
        return;
    }

    let button = createButton(null, 'fa-comment', 'ציטיר אין קאמענטארן אשכול', 'ציטיר אין קאמענטארן אשכול', `quoteInOtherTopic("${postID}", ${JSON.stringify(topicMapping)})`);
    
    let quoteLi = getQuoteElm(btn)?.parentElement;
    if (quoteLi) {
        quoteLi.parentNode.insertBefore(button.li, quoteLi.nextSibling);
    }
}

async function quoteInOtherTopic(postID, topicMapping) {
    const currentTopicId = getCurrentTopicIdFromDOM();
    const targetTopicId = topicMapping[currentTopicId];

    if (!targetTopicId) {
        alert("No target topic found for this topic in the mapping.");
        return;
    }

    const quoteURL = `https://www.ivelt.com/forum/posting.php?mode=quote&p=${postID}`;
    const response = await fetch(quoteURL);
    const responseText = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(responseText, "text/html");
    const messageBox = doc.querySelector("#message-box #message");

    if (!messageBox) {
        alert("די ציטירטע תגובה איז נישט אויפגעכאפט געווארן.");
        return;
    }

    const quotedMessage = messageBox.value;

    const replyURL = `https://www.ivelt.com/forum/posting.php?mode=reply&t=${targetTopicId}`;
    const replyWindow = window.open(replyURL, '_blank');

    replyWindow.onload = () => {
        const textarea = replyWindow.document.querySelector("#message-box textarea");
        if (textarea) {
            textarea.value = quotedMessage;
        }
    };
}

async function addCustomButtonsToAllPosts() {
    const topicMapping = await fetchTopicMapping();

    if (!topicMapping) {
        alert("Failed to load topic mappings.");
        return;
    }

    let btns = document.querySelectorAll('.post-buttons');
    btns.forEach(btn => {
        let postID = btn.parentElement.getAttribute("id").replace("post_content", "");
        addQuoteInOtherTopicButton(btn, postID, topicMapping);
    });
}

addCustomButtonsToAllPosts();
