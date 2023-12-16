import cors from 'cors'
import express, { json } from 'express'
import { get } from 'http'
import { privateApiKey } from './secrets'

const app = express()
const CronJob = require("node-cron");
const ipfilter = require('express-ipfilter').IpFilter
let theResult;

// Blacklist the following IPs
const ips = ['127.0.0.1']

app.use(express.json())
app.use(cors())
 
// Create the server
app.use(ipfilter(ips))

let initScheduledJobs = () => {
  const scheduledJobFunctionAtMorning = CronJob.schedule("10 0 6 * * *", () => {
    update()
  });
  scheduledJobFunctionAtMorning.start();

  const scheduledJobFunctionAtMidnight = CronJob.schedule("20 0 0 * * *", () => {
    console.log("theResult " + theResult);
    theResult = {today: theResult.tomorow, tomorow: 0, hp: 6, hc: 22};
  });
  scheduledJobFunctionAtMidnight.start();
}



initScheduledJobs();

app.set('trust proxy', true)

app.get('/', (req, res) => res.send('🏠 Tempo Service By v3ry3D 🏠'))
app.get('/tempo', (req, res) => getTempo(req,res))


getToken().then(value=>{
  getTempoInfo(value).then(result=> theResult = result);
});  

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
        .then((rese:any)=> rese.tempo_like_calendars.values.map(val=> val.value))
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
  if(startDate){
    dateString = date.getFullYear() + "-" + (date.getMonth()+1)+ "-" + date.getDate() + "T00:00:00%2B02:00"
    return dateString;
  }else{
    dateString = date.getFullYear() + "-" + (date.getMonth()+1)+ "-" + (date.getDate()+2) + "T01:00:00%2B02:00"
    return dateString;
  }
}
function update(){
  const date = new Date();
  console.log(date.toLocaleString());
  console.log("Execution tache planifié récupération des données");
  getToken().then(value=>{
    getTempoInfo(value).then(result=> theResult = result);
  });  
}
app.listen(3000, () => console.log('ReTempo Api Serveur V1.1 Started'))