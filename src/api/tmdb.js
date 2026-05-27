window.setTitleWithTmdbImage = function(titleText, meta) {
    var titleElement = document.getElementById('title-text');
    var logos = meta && meta.images && meta.images.logos;
    var logo = null;
    if (logos && logos.length > 0) {
        logo = logos.find(function (l) { return l.iso_639_1 === 'en'; });
        if (!logo) logo = logos.find(function (l) { return !l.iso_639_1 || l.iso_639_1 === 'xx'; });
        if (!logo) logo = logos[0];
    }
    if (!logo && meta && meta.logo_object && meta.logo_object.file_path) {
        logo = meta.logo_object;
    }
    if (logo && logo.file_path) {
        var logoUrl = 'https://image.tmdb.org/t/p/w300' + logo.file_path;
        titleElement.innerHTML = '<img src="' + logoUrl + '" alt="' + titleText + '" style="max-height:24px;max-width:200px;object-fit:contain;">';
    } else {
        titleElement.textContent = titleText;
    }
}
