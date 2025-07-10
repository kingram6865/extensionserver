export function formatDateString(input) {
  let newDate = (typeof input === 'string') ? new Date(input) : new Date();
  const year = newDate.getFullYear();
  const month = (newDate.getMonth() < 9) ? `0${newDate.getMonth() + 1}` : newDate.getMonth() + 1;
  const day = (newDate.getDate() < 10) ? `0${newDate.getDate()}` : newDate.getDate();
  const hours = (newDate.getHours() < 10) ? `0${newDate.getHours()}` : newDate.getHours();
  const minutes = (newDate.getMinutes() < 10) ? `0${newDate.getMinutes()}` : newDate.getMinutes();
  const seconds = (newDate.getSeconds() < 10) ? `0${newDate.getSeconds()}` : newDate.getSeconds();

  return {
    dateOnly: `${year}-${month}-${day}`,
    dateTime: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }
}

export function formatPublishedDate(data) {
  let newDate = data.split(/[: T-]/).map(parseFloat)

  const year = (newDate[0] < 10) ? `0${newDate[0]}` : newDate[0]
  const month = (newDate[1] < 10) ? `0${newDate[1]}` : newDate[1]
  const day = (newDate[2] < 10) ? `0${newDate[2]}` : newDate[2]
  const hours = (newDate[3] < 10) ? `0${newDate[3]}` : newDate[3]
  const minutes = (newDate[4] < 10) ? `0${newDate[4]}` : newDate[4]
  const seconds = (newDate[5] < 10) ? `0${newDate[5]}` : newDate[5]

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function formatDuration(input){
  /**
   * Youtube metadata contains a duration field in the form PT99H99M99S
   *
   * The duration data in the video data is in ISO 8601 format (https://www.w3.org/TR/NOTE-datetime)
   * E.g.: PT11M58S
   *
   * This function converts it to a string of digits for compatibility with the database storage format
   */

  let timeinfo = [];
  let timedata = input
  let matches =[/(\d+)H/,/(\d+)M/,/(\d+)S/];

  for (let k=0; k < matches.length; k++){
          timeinfo[k] = (timedata.match(matches[k])) ? timedata.match(matches[k])[1].padStart(2,'0') : '00';
  }

  return timeinfo.join("");
}

export function secondsToHMS(seconds) {
  seconds = Number(seconds);

  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((seconds % 3600)/60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');

  return `${hours}${minutes}${secs}`;
}
