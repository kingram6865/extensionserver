import 'dotenv/config';
import axios from 'axios';
import { executeSQL, formatSQL } from '../db/connect';
import * as color from './consoleColors'
import { formatPublishedDate, formatDuration, secondsToHMS } from './tools';
const baseUrl = `https://youtube.googleapis.com/youtube/v3`
const targetDatabase = 'random_facts'

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
    let checkSQL = `SELECT objid, caption, amount_viewed, play_length, notes, debug_info FROM youtube_downloads WHERE objid = ${results.data.insertId}`
    executeSQL(checkSQL, targetDatabase, 55)
      .then(x => console.log(`Line 101: [${color.brightYellow}${x.data[0].objid}${color.Reset}] ${color.brightBlue}${x.data[0].caption}${color.Reset} (${color.brightGreen}${x.data[0].amount_viewed}${color.Reset} <==> ${color.brightCyan}${x.data[0].play_length}${color.Reset})`));

    return results;
  } catch(err) {
    console.log(err)
  }
}

async function updateWatchTime(input) {
  let SQL, data, message
  if (input.complete) {
    data = [input.objid];
    SQL="UPDATE youtube_downloads SET viewed = 1, amount_viewed = play_length WHERE objid = ?";
    message = `${input.objid} is updated to 100% viewed.`;
  } else {
    data = [input.time, input.objid];
    SQL="UPDATE youtube_downloads SET viewed = 1, amount_viewed = ? WHERE objid = ?";
    message = `${input.objid} amount_viewed is updated to ${input.time}.`;;
  }

  try {
    let results = await executeSQL(SQL, targetDatabase, 55, data);
    console.log(`Updated objid = ${input.objid} amount_viewed to ${input.time}`);
    return {results, message};
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
  console.log('Line 141: ', JSON.stringify(input))
  // return {message: 'Reached backend!'}
  let output
  const videoId = input.videoid
  const rewatch = input.rewatch
  
  let videodata, channeldata, channelId, videoAPIData, channelAPIData, updateNotes
  let addChannelResults, addVideoResults
  const messages = {}
  videodata = await videoExists(videoId);
  if (videodata.data.length) {
    channelId = videodata.data[0].channel_owner_id;
    
    if (input.viewed) {
      messages.updateNotes = await updateWatchTime({time: secondsToHMS(input.time), objid: videodata.data[0].objid, completed: input.complete})
    } else {
      messages.updateNotes = `The video is already archived. No Changes being made. Amount Viewed = ${videodata.data[0].amount_viewed}`
    }
    output = {messages, ArchiveInfo: videodata}
    console.log(JSON.stringify(output, null, 2));
  } else {
    messages.videoMessage = `${videoId} does not exist in the archive. Retrieving data from Youtube API`;
    videoAPIData = await getVideoData(videoId)
    channeldata = await channelExists(videoAPIData.ChannelId)
    if (channeldata.data.length) {
      messages.channelmessage = `Add ${videoId} with channel owner ${videoAPIData.ChannelId}(${channeldata.data[0].owner_name})`
      videoAPIData.Viewed = input.viewed;
      videoAPIData.AmountViewed = (input.viewed) ? videoAPIData.PlayLength : secondsToHMS(input.time);
      addVideoResults = await dbAddVideo({...videoAPIData, ChannelOwnerId: channeldata.data[0].objid, Rewatch: rewatch});
      // messages.addVideoResultsmessage = `Added objid[${addVideoResults.data[0].insertId}] ${videoId} with channel owner objid[${channeldata.data[0].objid}] ${videoAPIData.ChannelId}(${channeldata.data[0].owner_name})`
      // messages.addVideoResultsmessage = resultsAddVideo
      output = { messages, dbVideoInfo: videodata.data[0], dbChannelInfo: channeldata.data[0], videoAPIData, addVideoResults }
      // output = { messages, dbChannelInfo: channeldata.data[0], videoAPIData, addVideoResults }
    } else {
      messages.channelmessage = `${videoId} and it's parent channel ${videoAPIData.ChannelId} do not exist in archive. Retrieving Youtube API data for channel adding both to archive.`
      channelAPIData = await getChannelData(videoAPIData.ChannelId);
      addChannelResults = await dbAddChannel(channelAPIData);
      videoAPIData.ChannelOwnerId = addChannelResults.data.insertId
      videoAPIData.Viewed = input.viewed;
      videoAPIData.AmountViewed = (input.viewed) ? videoAPIData.PlayLength : secondsToHMS(input.time);
      addVideoResults = await dbAddVideo({...videoAPIData, Rewatch: rewatch})
      output = { messages, dbVideoInfo: videodata.data[0], dbChannelInfo: channeldata.data[0], videoAPIData, channelAPIData, addChannelResults, addVideoResults }
    }
  }

  return output;
}
