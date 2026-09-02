async (page) => {
  const response = await page.request.get('https://mostaql.com/projects?sort=latest', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      'Accept-Language': 'ar,en;q=0.9'
    }
  });
  const html = await response.text();
  await page.setContent(html);
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener() {} } } };
  });
  await page.addScriptTag({ path: 'offscreen.js' });
  await page.addScriptTag({ path: 'bg/filters.js' });

  const projectLink = page.locator('a[href*="/project/"]');
  const rows = await page.locator('tr').filter({ has: projectLink }).count();
  const links = await projectLink.count();
  const parsedJobs = await page.evaluate((sourceHtml) => parseMostaqlHTML(sourceHtml), html);
  const freshJobs = await page.evaluate(
    (jobs) => jobs.filter(job => isRecentlyPublishedJob(
      job,
      { interval: 1 },
      new Date(Date.now() - 60 * 1000).toISOString()
    )),
    parsedJobs
  );

  return {
    status: response.status(),
    bytes: html.length,
    rows,
    links,
    parsedJobs: parsedJobs.length,
    freshJobs: freshJobs.length,
    firstProjectId: parsedJobs[0]?.id,
    firstPostedAt: parsedJobs[0]?.postedAt
  };
}
