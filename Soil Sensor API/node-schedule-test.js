var schedule = require('node-schedule');

var j = schedule.scheduleJob('/5* * * * *', function(){
  console.log('This should execute every 5 seconds');
});
console.log(j);