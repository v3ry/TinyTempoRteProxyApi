import cors from 'cors'
import express, { json } from 'express'
import { get } from 'http'
import { privateApiKey } from './secrets'

const app = express()
const CronJob = require("node-cron");
let theResult = {today: 0, tomorow: 0, hp: 6, hc: 22};

// Blacklist the following IPs
const ips = ['127.0.0.1']

app.use(express.json())
app.use(cors())
 
// Create the server

let initScheduledJobs = () => {
  const scheduledJobFunctionAtMorning = CronJob.schedule("10 0 6 * * *", () => {
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

app.get('/', (req, res) => res.send('🏠 Tempo Service By v3ry3D 🏠'))
app.get('/tempo', (req, res) => getTempo(req,res))

update();

async function getTempo(req,res){
  var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress 
  console.debug("api request by : " + ip);
 res.send(theResult)
}

async function getToken() : Promise<any>{
    try{
      const myHeaders = new Headers();
      myHeaders.append('Content-Type', 'application/x-www-form-urlencoded');
      myHeaders.append('Authorization', 'Basic '+ privateApiKey);
      //the URL of the website to which the content must be posted is passed as a parameter to the fetch function along with specifying the method, body and header
      let response = await fetch('https://digital.iservices.rte-france.com/token/oauth/', {
          method: 'POST',
          credentials: 'include',
          headers: myHeaders,
          })
          .then(response=>response.json())
          .then((rese:any)=> rese["access_token"])
      return await response;
  }catch (error) {
    if (error instanceof Error) {
      console.log(error);
      getToken()
      console.log('error message: ', error.message);
      return error.message;
    } else {
      console.log('unexpected error: ', error);
      return 'An unexpected error occurred';
    }
  }
  
}

async function getTempoInfo(token: string) : Promise<any>{
  try{
    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/x-www-form-urlencoded');
    myHeaders.append('Authorization',"Bearer " + token);
    const date = new Date();
    console.log('Appel API en cours ...');
    console.log(date.toLocaleString());
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
function getDate(startDate:boolean): string{
  let date = new Date();
  let dateString;
  let MS_DELAY = 172800000
  if(!startDate && date.getHours() < 6){
    MS_DELAY = 86400000;
  }
  if(startDate){
    dateString = date.getFullYear() + "-" + (date.getMonth()+1)+ "-" + date.getDate() + "T00:00:00%2B02:00"
    console.log("start date : " + dateString);
    return dateString;
  }else{
    let current = new Date();
    let followingDay = new Date(current.getTime() + MS_DELAY);
    dateString = followingDay.getFullYear() + "-" + (followingDay.getMonth()+1)+ "-" + (followingDay.getDate()) + "T00:00:00%2B02:00"
    console.log("End date : " + dateString);
    return dateString;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function update(): Promise<void> {
  const date = new Date();
  console.log(date.toLocaleString());
  console.log("Execution tache planifié récupération des données");

  try {
    const token = await getToken();
    console.log("The token info is:", token);

    const result = await getTempoInfo(token);
    theResult = result;
    console.log(theResult);

    if (theResult.today > 0 && theResult.today < 4) {
      console.log("Valeur d'api correcte");
    } else {
      console.log("Valeur d'api incorrecte");
      await delay(5000); // Ajoute un délai de 5 secondes avant de rappeler update
      update();
    }
  } catch (error) {
    console.error("Failed to update:", error);
  }
}

app.listen(3000, () => console.log('ReTempo Api Serveur V1.3 Started'))