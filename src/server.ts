import cors from 'cors'
import express, { json, Request, Response } from 'express'
import { privateApiKey } from './secrets'
import cron from 'node-cron' // Changed from require to import

const app = express()
let theResult: { today: number; tomorow: number; hp: number; hc: number } = { today: 0, tomorow: 0, hp: 6, hc: 22 };
let isUpdating = false;

// Extracted IP blacklist to a constant
const IP_BLACKLIST: string[] = ['127.0.0.1'];

app.use(express.json())
app.use(cors())

// Create the server

let initScheduledJobs = () => {
  const MORNING_SCHEDULE = "10 5 6 * * *";
  const MIDNIGHT_SCHEDULE = "20 0 23 * * *";

  cron.schedule(MORNING_SCHEDULE, () => {
    console.log("Execution tache planifié récupération des données");
    isUpdating = false;
    update();
  }).start();

  cron.schedule(MIDNIGHT_SCHEDULE, () => {
    console.log("theResult " + theResult);
    theResult = { today: theResult.tomorow, tomorow: 0, hp: 6, hc: 22 };
  }).start();
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

async function getToken(): Promise<string> {
  if (accessToken && tokenExpirationTime && Date.now() < tokenExpirationTime) {
    console.log("Using cached access token expire at : " + new Date(tokenExpirationTime).toLocaleString('fr-FR', { hour12: false }));
    return accessToken;
  }

  try {
    const headers = createHeaders('Basic ' + privateApiKey);
    const response = await fetch('https://digital.iservices.rte-france.com/token/oauth/', {
      method: 'POST',
      credentials: 'include',
      headers,
    });

    const data = await response.json();
    accessToken = data["access_token"];
    tokenExpirationTime = Date.now() + data["expires_in"] * 1000;
    return accessToken;
  } catch (error) {
    console.error("Error:", error);
    throw new Error('Failed to obtain access token');
  }
}

function createHeaders(auth: string): Headers {
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('Accept', 'application/json');
  headers.append('Authorization', auth);
  return headers;
}

// Refactored getTempoInfo to use async/await
async function getTempoInfo(token: string): Promise<any> {
  try {
    const headers = createHeaders("Bearer " + token);
    const date = new Date().toLocaleString('fr-FR', { hour12: false });
    console.log('Appel API en cours à ' + date + ' ...');
    const response = await fetch(`https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars?start_date=${getDate(true)}&end_date=${getDate(false)}`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    const data = await response.json();
    console.log(data);
    const values = data?.tempo_like_calendars?.values?.map((val: any) => val.value) || [];
    const mapped = values.map((toto: string) => {
      switch (toto) {
        case "BLUE": return 1;
        case "WHITE": return 2;
        case "RED": return 3;
        default: return 0;
      }
    });
    console.log(mapped.length);
    if (mapped.length === 2) {
      return { today: mapped[1], tomorow: mapped[0], hp: 6, hc: 22 };
    } else {
      return { today: mapped[0], tomorow: 0, hp: 6, hc: 22 };
    }
  } catch (error: any) {
    console.error("Error:", error.message || error);
    return error.message || 'An unexpected error occurred';
  }
}

async function checkAndUpdate(response: any): Promise<void> {
  console.log("response " ,response);
    const currentHour = new Date().getHours();
    if (response.tomorow === 0 && currentHour >= 6 && currentHour < 10) {
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

const PORT = 3000;
app.listen(PORT, () => console.log(`ReTempo Api Serveur V1.4 Started on port ${PORT}`))