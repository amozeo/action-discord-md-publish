import fs from "node:fs/promises";

import * as core from "@actions/core";
import { WebhookClient } from "discord.js";

import storage from "./storage";

async function main() {
  const client = new WebhookClient({
    url: core.getInput("webhook", { required: true })
  });

  const presentMessageIds = await storage.getMessageIDs();

  const presentMessages = presentMessageIds.map(
    e => client.fetchMessage(e)
  );

  const fileContents = await fs.readFile(
    core.getInput("file", { required: true })
  ).then(v => v.toString());

  const messageBlocks = fileContents
    .split(/\n\n+|\n+(?=# )/gm)
    .map(v => v.trim())
    .filter(v => v.length >= 0)
    .reduce(
      (acc, cv, i) => {
        core.debug(`Index: ${i}, acc length: ${acc.length}, acc[i-1] length: ${acc[i-1]?.length ?? "none"}`)
        const lengthOfLast = acc[acc.length-1]?.length ?? 0;
        if (cv.length > 2000)
          throw new Error(
            `Text block #${i+1} is too long\n
            Starts with: ${cv.substring(0, 40)}...\n
            Ends with: ...${cv.substring(cv.length-40)})`
          )
        if (lengthOfLast + cv.length <= 2000)
          acc[acc.length-1] += lengthOfLast === 0 ? cv
            : cv.match(/^#{1,3} /) ? "\n" + cv
            : "\n\n" + cv;
        else
          acc.push(cv);
        return acc;
      },
      [""]
    );

  let shouldPostMessages = false;
  if (presentMessages.length !== messageBlocks.length) {
    core.info("number of message blocks is different, sending messages");
    core.debug(`read "blocks": ${messageBlocks.length}, number of read messages: ${presentMessages.length}`);
    shouldPostMessages = true;
  }
  if (!shouldPostMessages) for (let i = 0; i < messageBlocks.length; i++) {
    // FIXME: discord may strip special unicode characters, making strings different
    //        and this case is not being handled here
    const fetchedMessage = (await presentMessages[i]).content;
    if (fetchedMessage === messageBlocks[i]) continue;
    core.info(`Block #${i} is not equal, sending messages`);
    core.debug("Block read:");
    core.debug(messageBlocks[i]);
    core.debug("Block fetched:");
    core.debug(fetchedMessage);
    shouldPostMessages = true;
    break;
  }

  if (!shouldPostMessages) {
    core.info("Nothing to send, messages are equal");
    return;
  }

  const { messageIDs, thrown: sendingErrored } = await messageBlocks.reduce(
      (acc, cv) => acc.then(async ({messageIDs, thrown}) => {
        if (thrown) return { messageIDs, thrown };
        try {
          core.info(`Sending message #${messageIDs.length}`)
          const message = await client.send({
            allowedMentions: { parse: [] },
            content: cv,
          });
          messageIDs.push(message.id);
        }
        catch (error) {
          core.error("Something went wrong when sending messages");
          core.error(error as Error);
          thrown = true;
        }
        return { messageIDs, thrown };
      }),
      Promise.resolve({ messageIDs: [] as string[], thrown: false })
    );

  if (sendingErrored) {
    core.info("Trying to delete sent messages");
    await Promise.all(messageIDs.map((v => client.deleteMessage(v))));
    return;
  }

  const messageIDsConcatenated = messageIDs.join("\n");
  core.info(`Messages sent! IDs:\n${messageIDsConcatenated}`);
  await fs.writeFile(core.getInput("outputFileLocation"), messageIDsConcatenated);
  
  await Promise.all([
    storage.pushMessageIDs(),
    presentMessageIds.map(v => client.deleteMessage(v)),
    ].flat()
  );
}

main().catch((e) => {
  console.log(e);
  core.setFailed(e);
});
