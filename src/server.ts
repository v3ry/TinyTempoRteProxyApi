import cors from 'cors'
import express, { json, Request, Response } from 'express'
import { get } from 'http'
import { privateApiKey } from './secrets'

const app = express()
const CronJob = require("node-cron");
let theResult = {today: 0, tomorow: 0, hp: 6, hc: 22};
let isUpdating = false;

// Blacklist the following IPs
const ips = ['127.0.0.1']

app.use(express.json())
app.use(cors())
 
// Create the server

let initScheduledJobs = () => {
  const scheduledJobFunctionAtMorning = CronJob.schedule("10 5 6 * * *", () => {
    console.log("Execution tache planifié récupération des données");
    isUpdating=false;
    update()
  });
  scheduledJobFunctionAtMorning.start();

  const scheduledJobFunctionAtMidnight = CronJob.schedule("20 0 23 * * *", () => {
    console.log("theResult " + theResult);
    theResult = {today: theResult.tomorow, tomorow: 0, hp: 6, hc: 22};
  });
  scheduledJobFunctionAtMidnight.start();
}



initScheduledJobs();

app.set('trust proxy', true)

app.get('/', (req: Request, res: Response) => { res.send('🏠 Tempo Service By v3ry3D 🏠')})
app.get('/tempo', (req, res) => getTempo(req,res))

update();

async function getTempo(req,res){
  var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress 
  console.debug(new Date().toLocaleString('fr-FR', { hour12: false }) +" api request by : " + ip);
 res.send(theResult)
}

let accessToken: string | null = null;
let tokenExpirationTime: number | null = null;

async function getToken() : Promise<any>{
  if (accessToken && tokenExpirationTime && Date.now() < tokenExpirationTime) {
    console.log("Using cached access token expire at : " + new Date(tokenExpirationTime).toLocaleString('fr-FR', { hour12: false }));
    return accessToken;
  }

    try{
      const myHeaders = new Headers();
      myHeaders.append('Content-Type', 'application/json');
      myHeaders.append('Accept', 'application/json');
      myHeaders.append('Authorization', 'Basic ' + privateApiKey);
  
      const response = await fetch('https://digital.iservices.rte-france.com/token/oauth/', {
        method: 'POST',
        credentials: 'include',
        headers: myHeaders,
      });
  
      const data = await response.json();
      accessToken = data["access_token"];
      const expiresIn = data["expires_in"]; // Assuming the response contains an "expires_in" field in seconds
      tokenExpirationTime = Date.now() + expiresIn * 1000; // Convert to milliseconds
  
      return accessToken;
    } catch (error) {
      console.error("Error:", error);
      throw new Error('Failed to obtain access token');
    }
  
}

async function getTempoInfo(token: string) : Promise<any>{
  try{
    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/json');
    myHeaders.append('Accept', 'application/json');
    myHeaders.append('Authorization',"Bearer " + token);
    const date = new Date().toLocaleString('fr-FR', { hour12: false });
    console.log('Appel API en cours à '+ date + ' ...');
    let response = await fetch('https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars?start_date=' + getDate(true) + "&end_date="+ getDate(false), {
        method: 'GET',
        credentials: 'include',
        headers: myHeaders,
        })
        .then(response=>response.json())
        .then(response => { console.log(response); return response; })
        .then((rese: any) => {
          if (rese && rese.tempo_like_calendars && rese.tempo_like_calendars.values) {
              return rese.tempo_like_calendars.values.map(val => val.value);
          } else {
              throw new Error("Invalid response structure");
          }
      })
        .then(value=> value.map(toto=> {
          if(toto == "BLUE"){
              return 1
            }else if(toto == "WHITE"){
              return 2
            }else if(toto == "RED"){
              return 3
            }else{
              return 0
            }
        }))
        console.log(response.length);
        if( await response.length == 2){
          response = {today: response[1], tomorow: response[0], hp: 6, hc: 22}
          console.log("Today : " + response.today + "  Tomorow : " + response.tomorow);
        }else{
          response = {today: response[0], tomorow: 0, hp: 6, hc: 22}
          console.log("Today : " + response.today);
        }
        
    return await response;
  }catch (error) {
    if (error instanceof Error) {
      console.log("error : " + error);
      console.log('error message: ', error.message);
      return error.message;
    } else {
      console.log('unexpected error: ', error);
      return 'An unexpected error occurred';
    }
  }
}



async function checkAndUpdate(response: any): Promise<void> {
  console.log("response " ,response);
    const currentHour = new Date().getHours();
    if (response.tomorow === 0 && currentHour >= 6 && currentHour < 7) {
      console.log("Retrying in 30 seconds...");
      await delay(30000);
      isUpdating = false;
      update();
    }
}
function getDate(startDate:boolean): string{
  let date = new Date();
  let dateString;
  let MS_DELAY = 172800000
  if(!startDate && date.getHours() < 6){
    MS_DELAY = 86400000;
  }

  const currentOffset = date.getTimezoneOffset();
  const followingDay = new Date(date.getTime() + MS_DELAY);
  const followingDayOffset = followingDay.getTimezoneOffset();

  const timezoneOffset = currentOffset === -120 ? "02:00" : "01:00";
  const followingDayTimezoneOffset = followingDayOffset === -120 ? "02:00" : "01:00";

  if(startDate){
    dateString = date.getFullYear() + "-" + (date.getMonth()+1)+ "-" + date.getDate() + "T00:00:00%2B" + timezoneOffset
    console.log("start date : " + dateString);
    return dateString;
  }else{
    dateString = followingDay.getFullYear() + "-" + (followingDay.getMonth()+1)+ "-" + (followingDay.getDate()) + "T00:00:00%2B" + followingDayTimezoneOffset
    console.log("End date : " + dateString);
    return dateString;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}



async function update(): Promise<void> {

  if (isUpdating) {
    console.log("Update already in progress, skipping...");
    return;
  }

  const date = new Date();
  console.log(date.toLocaleString('fr-FR', { hour12: false }));
  isUpdating = true;

  try {
    const token = await getToken();
    console.log("The token info is:", token);

    const result = await getTempoInfo(token);
    theResult = result;
    await checkAndUpdate(result);

    if (theResult.today > 0 && theResult.today < 4) {
      console.log("Valeur d'api correcte");
    } else {
      console.log("Valeur d'api incorrecte");
      await delay(30000); // Ajoute un délai de 30 secondes avant de rappeler update
      isUpdating = false;
      update();
    }
  } catch (error) {
    console.error("Failed to update:", error);
  } finally {
    isUpdating = false;
  }
}

app.listen(3000, () => console.log('ReTempo Api Serveur V1.4 Started'))