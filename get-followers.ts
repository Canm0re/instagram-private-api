import { IgApiClient } from 'instagram-private-api';
import * as fs from 'fs';
import 'dotenv/config';

(async () => {
  const ig = new IgApiClient();
  ig.state.generateDevice(process.env.IG_USERNAME);

  async function handleLogin() {
    try {
      await ig.simulate.preLoginFlow();
      console.log('Attempting initial login...');
      return await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
    } catch (err) {
      if (err.response?.body?.message === 'challenge_required') {
        console.log('\n🔐 Security Check Required');
        console.log('Instagram detected login from:', 'Amsterdam, Netherlands');

        const challengeInfo = err.response.body.challenge;
        const apiPath = challengeInfo.api_path;

        // First, send start verification request
        await ig.request.send({
          url: `/api/v1${apiPath}`,
          method: 'GET',
        });

        console.log('\n👉 Please follow these steps EXACTLY:');
        console.log('1. Open this URL:', challengeInfo.url);
        console.log('2. Click "This Was Me"');
        console.log('3. Wait until you see "Thanks for verifying..."');
        console.log('4. DO NOT close the verification page');
        console.log('5. Press Enter here to continue\n');

        await new Promise(resolve => process.stdin.once('data', resolve));

        // Send verification confirmation
        await ig.request.send({
          url: `/api/v1${apiPath}`,
          method: 'POST',
          form: { choice: '0' },
        });

        console.log('Finalizing verification...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Final login attempt
        return await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
      }
      throw err;
    }
  }

  try {
    const loggedInUser = await handleLogin();
    console.log('Successfully logged in as:', loggedInUser.username);
    console.log('Searching for target account...');
    const targetUser = await ig.user.searchExact('nasdubaischool');
    console.log('Found target account:', targetUser.username);

    // Use proper feed handling as shown in documentation
    const followersFeed = ig.feed.accountFollowers(targetUser.pk);
    let allFollowers = [];

    // Collect all followers
    console.log('Starting to collect followers...');
    try {
      let followers;
      do {
        followers = await followersFeed.items();
        allFollowers = allFollowers.concat(
          followers.map(follower => ({
            username: follower.username,
            full_name: follower.full_name,
            is_private: follower.is_private,
            is_verified: follower.is_verified,
          })),
        );

        console.log(`Collected ${allFollowers.length} followers so far...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } while (followers.length > 0);

      fs.writeFileSync('followers.json', JSON.stringify(allFollowers, null, 2));
      console.log(`Success! Saved ${allFollowers.length} followers to followers.json`);
    } catch (e) {
      console.error('Error collecting followers:', e);
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', {
      name: error.name,
      message: error.message,
      response: error.response?.body,
    });
    process.exit(1);
  }
})();
