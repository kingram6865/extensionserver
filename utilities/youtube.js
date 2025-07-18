import 'dotenv/config';
import axios from 'axios';
import { executeSQL, formatSQL } from '../db/connect';
import * as color from './consoleColors'
import { formatPublishedDate, formatDuration, secondsToHMS, formatDateString } from './tools';
const baseUrl = `https://youtube.googleapis.com/youtube/v3`
const targetDatabase = 'random_facts'
// const targetDatabase = 'test'

function dbDataCondenser(input) {
  return {
    objid: input.objid,
    EntryDate: input.entry_date,
    UploadDate: input.upload_date,
    ChannelOwnerId: input.channel_owner_id,
    ChannelOwnerName: input.channel_owner_name,
    AmountViewed: input.amount_viewed,
    PlayLength: input.play_length,
    Caption: input.caption,
    Status: input.status,
    Rewatch: input.rewatch,
    Videoid: input.videoid
  }
}

export async function getVideoData(videoId) {
  // console.log(`utilities/youtube.js Line 9 -> getVideoData(${videoId})`)
  const videoUrl = `${baseUrl}/videos?part=snippet%2CcontentDetails%2Cstatistics&id=${videoId}&key=${process.env.API_KEY1}`;
  
  try {
    const result = await axios.get(videoUrl);
    const desiredData = {
      UploadDate: formatPublishedDate(result.data.items[0].snippet.publishedAt),
      ChannelId: result.data.items[0].snippet.channelId,
      Title: result.data.items[0].snippet.title,
      Description: result.data.items[0].snippet.description,
      Thumbnails: JSON.stringify(result.data.items[0].snippet.thumbnails),
      Keywords: (result.data.items[0].snippet.tags) ? result.data.items[0].snippet.tags.join(",") : "",
      PlayLength: formatDuration(result.data.items[0].contentDetails.duration),
      VideoId: videoId,
      Status: 1
    }

    return desiredData;
  } catch(err) {
    console.log(err)
  }
}

export async function getChannelData(channelId) {
  const channelUrl =`${baseUrl}/channels?part=snippet%2CcontentDetails%2Cstatistics&id=${channelId}&key=${process.env.API_KEY1}`;
  try {
    const result = await axios.get(channelUrl);
    const desiredData = {
      ChannelId: result.data.items[0].id,
      OwnerName: result.data.items[0].snippet.title,
      Description: result.data.items[0].snippet.description,
      CustomUrl: result.data.items[0].snippet.customUrl,
      Joined: formatPublishedDate(result.data.items[0].snippet.publishedAt),
      Thumbnails: JSON.stringify(result.data.items[0].snippet.thumbnails),
      Views: parseInt(result.data.items[0].statistics.viewCount)
    }

    return desiredData;
  } catch(err) {
    console.log(err)
  }
}

async function videoExists(videoid) {
  const SQL = "SELECT * FROM youtube_downloads WHERE videoid = ?";
  
  try {
    const results = await executeSQL(SQL, targetDatabase, 55, [videoid]);
    return results;
  } catch(err) {
    console.log(err)
  }
}

async function channelExists(channelid) {
  const SQL = "SELECT * FROM youtube_channel_owners WHERE channel_id = ?";
  
  try {
    const results = await executeSQL(SQL, targetDatabase, 55, [channelid]);
    return results;
  } catch(err) {
    console.log(err)
  }
}

async function dbAddVideo(input) {
  const SQL = "INSERT INTO youtube_downloads (channel_owner_id, upload_date, play_length,\
  url, caption, description, thumbnail, keywords, status, viewed, amount_viewed, rewatch)\
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?) "
  const data = [
    input.ChannelOwnerId,
    input.UploadDate,
    input.PlayLength,
    `https://www.youtube.com/watch?v=${input.VideoId}`,
    input.Title,
    input.Description,
    input.Thumbnails,
    input.Keywords,
    input.Status,
    input.Viewed,
    input.AmountViewed,
    input.Rewatch
  ];

  // let sql = formatSQL(SQL, data)
  // return sql

  try {
    const results = await executeSQL(SQL, targetDatabase, 55, data);
    let checkSQL = `SELECT objid, videoid, caption, amount_viewed, play_length, notes, debug_info FROM youtube_downloads WHERE objid = ${results.data.insertId}`
    executeSQL(checkSQL, targetDatabase, 55)
      .then(x => console.log(`(New ${input.Viewed} ): ${color.brightMagenta}${x.data[0].videoid}${color.Reset} [${color.brightYellow}${x.data[0].objid}${color.Reset}] ${color.brightBlue}${x.data[0].caption}${color.Reset} (${color.brightGreen}${x.data[0].amount_viewed}${color.Reset} <==> ${color.brightCyan}${x.data[0].play_length}${color.Reset}) [118]`));

    return results;
  } catch(err) {
    console.log(err)
  }
}

async function updateWatchTime(input) {
  let SQL, data, message
  if (input.completed) {
    data = [input.objid];
    SQL="UPDATE youtube_downloads SET viewed = 1, amount_viewed = play_length WHERE objid = ?";
    message = `${input.objid} is updated to 100% viewed.`;
  } else {
    data = [input.time, input.objid];
    SQL="UPDATE youtube_downloads SET viewed = 1, amount_viewed = ? WHERE objid = ?";
    message = `${input.objid} amount_viewed is updated to ${input.time}.`;
  }

  try {
    let results = await executeSQL(SQL, targetDatabase, 55, data);
    let updateResults = await executeSQL("SELECT * FROM youtube_downloads WHERE objid = ?", targetDatabase, 55, [input.objid])
    return {results, message, changeStatus: updateResults.data[0].amount_viewed };
  } catch(err) {
    console.log(err)
  }
}

async function dbAddChannel(input) {
  const SQL = "INSERT INTO youtube_channel_owners (channel_id, owner_name, description,\
  custom_url, joined, thumbnail_link, views) VALUES (?,?,?,?,?,?,?)"
  const data = [
    input.ChannelId,
    input.OwnerName,
    input.Description,
    input.CustomUrl,
    input.Joined,
    input.Thumbnails,
    input.Views,
  ];

  try {
    const results = await executeSQL(SQL, targetDatabase, 55, data);
    return results;
  } catch(err) {
    console.log(err)
  }
}

export async function validateVideoId(input) {
  // console.log('Line 168: ', JSON.stringify(input), secondsToHMS(input.time))
  let output
  const videoId = input.videoid
  const rewatch = input.rewatch
  
  let videodata, channeldata, channelId, videoAPIData, channelAPIData, updateNotes
  let addChannelResults, addVideoResults
  const messages = {}
  videodata = await videoExists(videoId);
  if (videodata.data.length) {
    let updateResponse
    channelId = videodata.data[0].channel_owner_id;
    const moment = formatDateString()
    
    if (input.complete === 0 && !videodata.data[0].viewed) {
      updateResponse = await updateWatchTime({time: secondsToHMS(input.time), objid: videodata.data[0].objid, completed: 0})
      messages.responseMessage = updateResponse.message
      console.log(`(Archived ${moment} '${input.button}') ${color.brightMagenta}${videoId}${color.Reset} [${color.brightYellow}${videodata.data[0].objid}${color.Reset}] ${color.brightBlue}${videodata.data[0].caption}${color.Reset} is archived and has not yet been viewed [185]`)      
    } else if (input.complete === 1 && videodata.data[0].pct_viewed < 100) {
      updateResponse = await updateWatchTime({time: secondsToHMS(input.time), objid: videodata.data[0].objid, completed: 1})
      messages.responseMessage = `([${videoId}] ${videodata.data[0].caption}) is archived as fully viewed.`
      console.log(`(Completed ${moment} '${input.button}') ${color.brightMagenta}${videoId}${color.Reset} [${color.brightYellow}${videodata.data[0].objid}${color.Reset}] ${color.brightBlue}${videodata.data[0].caption}${color.Reset} is archived. View amount changed to ${updateResponse.changeStatus} [189]`)
    } else if (input.complete === 2 && videodata.data[0].pct_viewed < 100) {
      updateResponse = await updateWatchTime({time: secondsToHMS(input.time), objid: videodata.data[0].objid, completed: 0})
      messages.responseMessage = `([${videoId}] ${videodata.data[0].caption}) is archived as partially viewed. Amount Viewed = ${secondsToHMS(input.time)}`
      console.log(`(Update ${moment} '${input.button}') ${color.brightMagenta}${videoId}${color.Reset} [${color.brightYellow}${videodata.data[0].objid}${color.Reset}] ${color.brightBlue}${videodata.data[0].caption}${color.Reset} is archived. Amount Viewed ==> ${updateResponse.changeStatus} [193]`)
    } else {
      // console.log(`${input.videoid}, ${input.button}, ${input.complete}`)
      if (input.button === 'save') {
        console.log(`(${moment} No action on '${input.button}') ${color.brightMagenta}${videoId}${color.Reset} [${color.brightYellow}${videodata.data[0].objid}${color.Reset}] ${color.brightBlue}${videodata.data[0].caption}${color.Reset} has been archived. [196]`)
      } else if (input.button === 'watched' || input.button == 'update') {
        console.log(`(${moment} No action on '${input.button}') ${color.brightMagenta}${videoId}${color.Reset} [${color.brightYellow}${videodata.data[0].objid}${color.Reset}] ${color.brightBlue}${videodata.data[0].caption}${color.Reset} has been fully viewed. [198]`)
      }
      
      // messages.updateNotes = `Archived and fully viewed. No action for ${videoId} ${videodata.data[0].objid} ${videodata.data[0].caption} '${input.button}'`
      messages.responseMessage = `Archived and fully viewed. No '${input.button}' action for ${videoId} ${videodata.data[0].objid} ${videodata.data[0].caption}!`
    }

    // let report = dbDataCondenser(videodata.data[0]) // videodata is before the update. The update function should send back the data after the update
    output = {messages}
    
    // console.log(JSON.stringify(output, null, 2));
    // console.log(`Line 190 (Updated): ${report.Videoid} [${report.objid}] ${report.Caption} (Amount Viewed => ${report.PlayLength})`);
  } else {
    messages.videoMessage = `${videoId} does not exist in the archive. Retrieving data from Youtube API`;
    videoAPIData = await getVideoData(videoId)
    channeldata = await channelExists(videoAPIData.ChannelId)
    if (channeldata.data.length) {
      messages.channelmessage = `Add ${videoId} with channel owner ${videoAPIData.ChannelId}(${channeldata.data[0].owner_name})`
      videoAPIData.Viewed = input.complete;
      videoAPIData.AmountViewed = (input.complete) ? videoAPIData.PlayLength : secondsToHMS(input.time);
      addVideoResults = await dbAddVideo({...videoAPIData, ChannelOwnerId: channeldata.data[0].objid, Rewatch: rewatch});
      // messages.addVideoResultsmessage = `Added objid[${addVideoResults.data[0].insertId}] ${videoId} with channel owner objid[${channeldata.data[0].objid}] ${videoAPIData.ChannelId}(${channeldata.data[0].owner_name})`
      // messages.addVideoResultsmessage = resultsAddVideo
      messages.responseMessage = `Added ${videoId} to existing channel ([${channeldata.data[0].objid}] ${channeldata.data[0].owner_name}) [223]`
      output = { messages, dbChannelInfo: channeldata.data[0], videoAPIData, addVideoResults }
      // output = { messages, dbChannelInfo: channeldata.data[0], videoAPIData, addVideoResults }
      // console.log(`Added ${videoId} to existing channel ([${channeldata.data[0].objid}] ${channeldata.data[0].owner_name}) [223]`)
    } else {
      messages.channelmessage = `${videoId} and it's parent channel ${videoAPIData.ChannelId} do not exist in archive. Retrieving Youtube API data for channel adding both to archive.`
      channelAPIData = await getChannelData(videoAPIData.ChannelId);
      addChannelResults = await dbAddChannel(channelAPIData);
      videoAPIData.ChannelOwnerId = addChannelResults.data.insertId
      videoAPIData.Viewed = input.complete;
      videoAPIData.AmountViewed = (input.complete) ? videoAPIData.PlayLength : secondsToHMS(input.time);
      addVideoResults = await dbAddVideo({...videoAPIData, Rewatch: rewatch})
      console.log(`Archived channel ${channelAPIData.OwnerName} [objid = ${addChannelResults.data.insertId}] and archived video link ${videoId} [objid = ${addVideoResults.data.insertId}] [232]`)
      messages.responseMessage = `Archived channel ${channelAPIData.OwnerName} [objid = ${addChannelResults.data.insertId}] and archived video link ${videoId} [objid = ${addVideoResults.data.insertId}] [233]`
      output = { messages, videoAPIData, channelAPIData, addChannelResults, addVideoResults }
      // console.log(output);
    }
  }

  // console.log(output)
  return output;
}
