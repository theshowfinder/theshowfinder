// Builds/refreshes the headline news stories now (same as the 05:00/17:00 cron step):
//   npx tsx --env-file=.env.local scripts/run-news-stories.ts [--dry]
import { generateNewsStories } from '../src/lib/newsStoriesJob'

generateNewsStories(new Date(), { dryRun: process.argv.includes('--dry') })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => { console.error(e); process.exit(1) })
