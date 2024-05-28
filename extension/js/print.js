// from https://bookmarkify.it/47839
// https://www.ivelt.com/forum/viewtopic.php?f=2&t=14310

let lastPage = (Array.from(document.querySelectorAll('.pagination li:not(.next)')).pop() || {}).textContent || '';

const baseUrl = document.URL.replace(/&start=\d*/, '');

function cleanPosts() {

    function removeAllSiblings(element) {
        while (element.nextSibling) {
            element.parentNode.removeChild(element.nextSibling);
        }

        while (element.previousSibling) {
            element.parentNode.removeChild(element.previousSibling);
        }
    }

    removeAllSiblings(document.querySelector('#page-body'));


    document.querySelectorAll('#page-body > :not(.post):not(.topic-title),  .post-buttons, ul.profile-icons, dl.postprofile, div.back2top, div.bg3, .signature, .post:not([id^="p"])').forEach(el => el.remove());

    let postElm = document.querySelectorAll('.postbody');
    for (let i = 0; i < postElm.length; i++) {
        postElm[i].style.width = '100%';
    }

    let responsiveElements = document.querySelectorAll('.responsive-hide');
    for (let i = 0; i < responsiveElements.length; i++) {
        responsiveElements[i].classList.remove('responsive-hide');
    }
    let filteredHeadingsElm = document.querySelectorAll('.postbody h3');
    filteredHeadingsElm.forEach(function (element) {
        if (element.textContent.includes('Re:')) {
            element.parentNode.removeChild(element);
        }
    });
}

async function loadPage(page) {
    if (page < lastPage) {
        document.getElementById('loading-page').textContent = page;
        await loadNextPage(page);
    } else {
        cleanPosts();
        window.print();
    }
}

function loadNextPage(page) {
    let url = baseUrl + '&start=' + (page++ * 25);

    return fetch(url)
        .then(response => response.text())
        .then(data => {
            let element = document.createElement('h3');
            element.className = 'page-number-new';
            element.textContent = 'זייט ' + page;
            element.style.cssText = 'text-align: center; font-size: 14px';

            let parser = new DOMParser();
            let doc = parser.parseFromString(data, 'text/html');
            let postsHTML = Array.from(doc.querySelectorAll('.post')).map(e => e.outerHTML).join("");

            const posts = document.querySelectorAll('.post');
            const lastPost = posts[posts.length - 1]
            lastPost.insertAdjacentHTML('afterend', element.outerHTML + postsHTML);

            return loadPage(page);
        });
}

function printThread() {

    const on_page = document.querySelector('.pagination li.active')?.textContent || "0";

    if (on_page === "0") {
        return;
    }

    lastPage = Math.max(Number(on_page), Math.min(lastPage, prompt('You are on page ' + on_page + ' of ' + lastPage + ' pages.\r\nTill which page do you want to print?', lastPage)));
    let newElement = document.createElement('h3');
    newElement.style.textAlign = 'center';
    newElement.style.fontSize = '14px';
    newElement.textContent = 'loading page ';
    let newSpan = document.createElement('span');
    newSpan.id = 'loading-page';
    newElement.appendChild(newSpan);
    let pageBody = document.querySelector('#page-body');
    pageBody.parentNode.insertBefore(newElement, pageBody);

    loadPage(on_page);
}


function addPrintBtn() {
    let newLi = document.createElement('li');

    let newA = document.createElement('a');
    newA.href = "javascript:void(0);";
    newA.title = "פרינט עטליכע בלעטער/גאנצע אשכול";

    let newI = document.createElement('i');
    newI.className = "icon fa-print fa-fw";
    newI.setAttribute('aria-hidden', 'true');

    let newSpan = document.createElement('span');
    let textNode = document.createTextNode("פרינט עטליכע בלעטער/גאנצע אשכול");
    newSpan.appendChild(textNode);

    newA.appendChild(newI);
    newA.appendChild(newSpan);

    newLi.appendChild(newA);

    let uls = document.querySelectorAll('ul:has(.icon.fa-print.fa-fw)');
    uls.forEach(ul => {
        let clonedNode = newLi.cloneNode(true);
        clonedNode.querySelector('a').addEventListener('click', function (e) {
            e.preventDefault();
            printThread();
        });
        ul.appendChild(clonedNode);
    });
}

addPrintBtn();