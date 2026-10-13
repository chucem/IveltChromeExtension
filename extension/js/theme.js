// Applies the color theme chosen in settings (palettes in js/themes.data.js, styles in css/themes.css).
// Runs at document_start. chrome.storage is async, so the last applied variables are also
// cached in the site's localStorage, letting us set them before the first paint.
(function(){
	const root = document.documentElement;
	const cacheKey = 'iveltHelperTheme';
	let appliedVars = [];

	function setVars(themeId, vars){
		appliedVars.forEach(name => root.style.removeProperty(name));
		appliedVars = vars ? Object.keys(vars) : [];

		if(!vars){
			root.removeAttribute('data-ivh-theme');
			return;
		}

		appliedVars.forEach(name => root.style.setProperty(name, vars[name]));
		root.setAttribute('data-ivh-theme', themeId);
	}

	function applyTheme(items){
		// when themes are turned off in the settings the forum keeps its own look
		const theme = items.themesEnabled ? resolveTheme(items.theme, items.customTheme) : null;
		const vars = theme ? themeVars(theme) : null;

		setVars(items.theme, vars);

		try {
			if(vars)
				localStorage.setItem(cacheKey, JSON.stringify({ id: items.theme, vars }));
			else
				localStorage.removeItem(cacheKey);
		} catch(e) {}
	}

	function loadAndApply(){
		chrome.storage.local.get(['themesEnabled', 'theme', 'customTheme'], applyTheme);
	}

	try {
		const cached = JSON.parse(localStorage.getItem(cacheKey));
		if(cached && cached.vars)
			setVars(cached.id, cached.vars);
	} catch(e) {}

	loadAndApply();

	// switch live when the setting is changed (also while editing a custom theme)
	chrome.storage.onChanged.addListener((changes, area) => {
		if(area === 'local' && (changes.themesEnabled || changes.theme || changes.customTheme))
			loadAndApply();
	});
}());
