const {XMLHttpRequest} = require("xmlhttprequest");
const axios = require("axios");
const $ = require('cheerio');
const {writeFileSync, existsSync} = require('fs');
const {resolve} = require('path');


function testCORS(url) {
	const request = new XMLHttpRequest();
	request.open('GET', url, false);
	if (request.status === 200) {
		return true;
	}
	return false;
}

async function getStations(url) {
	const page = await axios.get(url);
	var matches = [];
	var regex = /var stream([0-9]{1,2}) = {\n\t       mp3: "(.*?)"/g;
	while (match = regex.exec(page.data)) {
		matches.push({id: match[1], url: match[2].replace('stream/1', '')});
	}
	//return page.data.match(/var stream([0-9]{1,2}) = {\n\t       mp3: "(.*?)"/g);
	var stations = $('tr', page.data).get().map(item => {
		var id = $('td', item)[0].attribs.id.replace('play_nohtml5_', '');
		if (matches.find(match => match.id == id)) {
			return {
				// id: id,
				name: $('.text-danger', item).text(),
				website: $('.small.text-success', item).attr("href"),
				url: matches.find(match => match.id == id).url
			};
		}
	});
	return stations.filter(Boolean);
}

async function getAll() {
	const stationsFile = resolve(__dirname, "stations.json");
	const stations = [];
	for (let page = 1; page <= 10; page++) {
		const url = `https://www.internet-radio.com/stations/talk/page${page}?sortby=listeners`;
		console.log('Getting', url);
		stations.push(...await getStations(url));
	}
	const cors = [];
	for (const station of stations) {
		console.log('Testing', station.name);
		try {
			await axios.head(station.url);
			cors.push(station);
		} catch (e) {}
	}
	console.log('Writing to', stationsFile);
	writeFileSync(stationsFile, JSON.stringify(cors, null, '\t'));
}

getAll();

// mp3: "(.*?)"

// 'var stream[0-9]{1,2} = {\n	       mp3: "(.*?)"'
