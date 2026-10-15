// Applies the color theme chosen in settings (palettes in js/themes.data.js, styles in css/themes.css).
// Runs at document_start on the forum, and in the <head> of the settings page and the popup,
// which use the same --t-* variables for their own colors.
// chrome.storage is async, so the last applied variables are also cached in localStorage
// (the forum's, or the extension's own), letting us set them before the first paint.
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
		// with "אריגינעל" (the default) picked the forum keeps its own look
		const theme = resolveTheme(items.theme, items.customTheme);
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
		chrome.storage.local.get(['theme', 'customTheme'], applyTheme);
	}

	try {
		const cached = JSON.parse(localStorage.getItem(cacheKey));
		if(cached && cached.vars)
			setVars(cached.id, cached.vars);
	} catch(e) {}

	loadAndApply();

	// switch live when the setting is changed (also while editing a custom theme)
	chrome.storage.onChanged.addListener((changes, area) => {
		if(area === 'local' && (changes.theme || changes.customTheme))
			loadAndApply();
	});
}());
