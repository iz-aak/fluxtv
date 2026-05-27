if (!window.langMap) window.langMap = {};

fetch('https://restcountries.com/v3.1/all?fields=cca2,languages')
    .then(function (res) { return res.json(); })
    .then(function (data) {
        if (!Array.isArray(data)) return;
        for (var i = 0; i < data.length; i++) {
            var country = data[i];
            var cCode = country.cca2 ? country.cca2.toLowerCase() : null;
            var languages = country.languages || {};
            Object.keys(languages).forEach(function (key) {
                var langName = languages[key].toLowerCase();
                if (!window.langMap[langName]) window.langMap[langName] = new Set();
                if (cCode) window.langMap[langName].add(cCode);
            });
        }

        window.getLangCode = function (label) {
            if (!label) return null;
            var key = label.toLowerCase().replace(/[^a-z]/g, ' ').trim().split(' ')[0];
            return window.langMap[key] ? Array.from(window.langMap[key])[0] : null;
        };

        window.flagImg = function (code) {
            if (!code) return '<span style="width:26px;height:20px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-globe" style="font-size:13px;color:rgba(255,255,255,0.3);"></i></span>';
            return '<img class="slg-flag" src="https://flagcdn.com/20x15/' + code + '.png" width="26" height="20" alt="">';
        };
    })
    .catch(function (err) {
        console.error("Failed to load country/language data", err);
    });
