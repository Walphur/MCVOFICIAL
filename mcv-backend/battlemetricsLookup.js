const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

function validateSteamId64(steamId64) {
  if (!/^\d{17}$/.test(String(steamId64))) {
    throw new Error("SteamID64 invalido");
  }
}

function extractBattleMetricsIdFromHref(href) {
  const match = href?.match(/battlemetrics\.com\/players\/(\d+)/i);
  return match?.[1] || null;
}

async function lookupWithAxios(steamId64) {
  const url = `https://atlasrust.com/player-lookup?steamid=${encodeURIComponent(steamId64)}`;

  const { data: html } = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const $ = cheerio.load(html);
  const href = $('a[href*="battlemetrics.com/players/"]').first().attr("href");

  const battleMetricsId = extractBattleMetricsIdFromHref(href);

  if (!battleMetricsId) return null;

  return {
    steamId64,
    battleMetricsId,
    battleMetricsUrl: `https://www.battlemetrics.com/players/${battleMetricsId}`,
    source: "axios-cheerio",
  };
}

async function lookupWithPuppeteer(steamId64) {
  const browser = await puppeteer.launch({
    headless: "new",
  });

  try {
    const page = await browser.newPage();

    await page.goto("https://atlasrust.com/player-lookup", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForSelector("input", { timeout: 15000 });

    await page.type("input", steamId64, { delay: 20 });
    await page.keyboard.press("Enter");

    await page.waitForSelector('a[href*="battlemetrics.com/players/"]', {
      timeout: 20000,
    });

    const href = await page.$eval(
      'a[href*="battlemetrics.com/players/"]',
      el => el.href
    );

    const battleMetricsId = extractBattleMetricsIdFromHref(href);

    if (!battleMetricsId) {
      throw new Error("No se pudo extraer el BattleMetrics ID");
    }

    return {
      steamId64,
      battleMetricsId,
      battleMetricsUrl: `https://www.battlemetrics.com/players/${battleMetricsId}`,
      source: "puppeteer",
    };
  } finally {
    await browser.close();
  }
}

async function getBattleMetricsFromAtlas(steamId64) {
  validateSteamId64(steamId64);

  const fastResult = await lookupWithAxios(steamId64);

  if (fastResult) {
    return fastResult;
  }

  return lookupWithPuppeteer(steamId64);
}

module.exports = {
  getBattleMetricsFromAtlas,
};
