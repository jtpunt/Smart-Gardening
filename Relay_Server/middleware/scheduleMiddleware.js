const MIN_SECOND = 0,
      MIN_MINUTE = 0,
      MIN_HOUR   = 0,
      MIN_DATE   = 1,
      MIN_MONTH  = 0,
      MIN_YEAR   = new Date().getFullYear(),
      MIN_DOW    = 0, // dayOfWeek
      
      MAX_SECOND = 59,
      MAX_MINUTE = 59,
      MAX_HOUR   = 23,
      MAX_DATE   = 31,
      MAX_MONTH  = 11,
      MAX_DOW    = 6;
      // test comment
let scheduleMiddleware = {
    checkScheduleInputs(req, res, next){
        var newSchedule = req.body,
            sanitizedSchedule = {
                schedule: undefined,
                device: undefined
            };
        console.log(`req.body = ${JSON.stringify(newSchedule)}`);
        try{
        // excected req.body 
        // req.body = {
        //     schedule: {
        //         start_time: {
        //             second: 0,
        //             minute: 30,
        //             hour: 11
        //         },
        //         end_time: {
        //             second: 0,
        //             minute: 30
        //             hour: 12
        //         },
        //         start_date: {
        //              date: 15,
        //              month: 9,
        //              year: 2020,
        //         },
        //         end_date: {
        //              date: 15,
        //              month: 9,
        //              year: 2020,
        //         },
        //         dayOfWeek: [0, 1, 4]
        //     },
        //     device: {
        //         id: mongoId,
        //         gpio: deviceGpio
        //     }
        // }  
            if(newSchedule === undefined)
                throw new Error("New schedule and device configuration details not found.")
            else{
                if(newSchedule['schedule'] === undefined)
                    throw new Error("New schedule configuration details not found.")
                else{
                    // end_time (off) details are required
                    if(newSchedule['schedule']['end_time'] === undefined)
                        throw new Error("End time schedule configuration details not found.")
                    else{
                        sanitizedSchedule['schedule'] = { end_time: undefined}
                        console.log(`checking end_time`);
                        // Second, minute, and hour details are required for end_time (off)
                        if(newSchedule['schedule']['end_time']['second'] === undefined)
                            throw new Error("End Time Second configuration details not found.")
                        if(newSchedule['schedule']['end_time']['minute'] === undefined)
                            throw new Error("End Time Minute configuration details not found.")
                        if(newSchedule['schedule']['end_time']['hour'] === undefined)
                            throw new Error("End Time hour configuration details not found.")
                        sanitizedSchedule['schedule']['end_time'] = {
                            second: newSchedule['schedule']['end_time']['second'],
                            minute: newSchedule['schedule']['end_time']['minute'],
                            hour: newSchedule['schedule']['end_time']['hour']
                        }
                    }
                    // start_time (on) details are not required
                    if(newSchedule['schedule']['start_time'] !== undefined){
                        console.log(`checking start_time`);
                        if(newSchedule['schedule']['start_time']['second'] === undefined)
                            throw new Error("End Time Second configuration details not found.")
                        if(newSchedule['schedule']['start_time']['minute'] === undefined)
                            throw new Error("End Time Minute configuration details not found.")
                        if(newSchedule['schedule']['start_time']['hour'] === undefined)
                            throw new Error("End Time hour configuration details not found.")
                        sanitizedSchedule['schedule']['start_time'] = {
                            second: newSchedule['schedule']['start_time']['second'],
                            minute: newSchedule['schedule']['start_time']['minute'],
                            hour: newSchedule['schedule']['start_time']['hour']
                        }
                    }
                    // Check For Start Date Date Based Scheduling Details
                    if(newSchedule['schedule']['start_date'] !== undefined){
                        console.log(`checking start_date`);
                        // Make sure the rest of the Date Based Scheduling Details were not left out
                        if(newSchedule['schedule']['start_date']['date'] === undefined)
                            throw new Error("Date input required for date-based scheduling");
                        if(newSchedule['schedule']['start_date']['month'] === undefined)
                            throw new Error("Month input required for date-based scheduling");
                        if(newSchedule['schedule']['start_date']['year'] === undefined)
                            throw new Error("Year input requried for date-based scheduling")
                        sanitizedSchedule['schedule']['start_date'] = {
                            date: newSchedule['schedule']['start_date']['date'],
                            month: newSchedule['schedule']['start_date']['month'],
                            year: newSchedule['schedule']['start_date']['year']
                        }
                    }
                    // Check For End Date Based Scheduling Details
                    if(newSchedule['schedule']['end_date'] !== undefined){
                        console.log(`checking end_date`);
                        // Make sure the rest of the Date Based Scheduling Details were not left out
                        if(newSchedule['schedule']['end_date']['date'] === undefined)
                            throw new Error("Month input required for date-based scheduling");
                        if(newSchedule['schedule']['end_date']['month'] === undefined)
                            throw new Error("Month input required for date-based scheduling");
                        if(newSchedule['schedule']['end_date']['year'] === undefined)
                            throw new Error("Year input requried for date-based scheduling")
                        sanitizedSchedule['schedule']['end_date'] = {
                            date: newSchedule['schedule']['end_date']['date'],
                            month: newSchedule['schedule']['end_date']['month'],
                            year: newSchedule['schedule']['end_date']['year']
                        }
                    }
                    // Check For Recurrence Based Scheduling details
                    if(newSchedule['schedule']['dayOfWeek'] !== undefined){
                        console.log(`checking dayOfWeek`);
                        // // Date-Based Scheduling Details can not be included with Recurrence Based Scheduling Details
                        // if(newSchedule['schedule']['start_date']['date'] !== undefined)
                        //     throw new Error("Recurrence Based Scheduling is not valid with date-based scheduling details");
                        // if(newSchedule['schedule']['start_date']['month'] !== undefined)
                        //     throw new Error("Recurrence Based Scheduling is not valid with date-based scheduling details");
                        // if(newSchedule['schedule']['start_date']['year'] !== undefined)
                        //     throw new Error("Recurrence Based Scheduling is not valid with date-based scheduling details");
                        sanitizedSchedule['schedule']['dayOfWeek'] = newSchedule['schedule']['dayOfWeek'];
                    }
                }
                // device details are required
                if(newSchedule['device'] === undefined){
                    throw new Error("New Device configurations not found");
                }else{
                    console.log(`checking device`);
                    // id - mongodb id representing our relay device - required
                    if(newSchedule['device']['id'] === undefined)
                        throw new Error("Device id not found!");
                    if(newSchedule['device']['relaySettingsId'] === undefined)
                        throw new Error("relaySettings id not found!");
                    // gpio port that controls our relay switch - required
                    if(newSchedule['device']['gpio'] === undefined)
                        throw new Error("Device GPIO not found!");
                    // 0 or 1, on or off? - required
                    if(newSchedule['device']['desired_state'] === undefined)
                        throw new Error("Device desired state not found!");
                    else{
                        // Make sure that only a boolean value was sent in
                        if(typeof newSchedule['device']['desired_state'] === 'boolean')
                            throw new Error("Desired state must be 'true' or 'false'.")
                    }
                    sanitizedSchedule['device'] = {
                        id: newSchedule['device']['id'],
                        relaySettingsId: newSchedule['device']['relaySettingsId'],
                        gpio: Number(newSchedule['device']['gpio']),
                        desired_state: newSchedule['device']['desired_state']
                    }
                }
            }
            req.body = sanitizedSchedule;
            next();
        }catch(exc){
            console.log(`err: ${exc}`);
            res.status(404).send(exc.toString());
        }
    },
    doesScheduleExist(scheduleHelper){
        return function(req, res, next){
            var schedule_id = req.params.schedule_id;
            if(!scheduleHelper.doesScheduleExist(schedule_id))
                res.status(404).send(`Schedule id - ${schedule_id} does not exist!`);
            else
                next();
        }
    },
    validateScheduleInputs(req, res, next){
        let schedule_config = req.body,
            schedule        = schedule_config['schedule'],
            start_time      = schedule['start_time'],
            end_time        = schedule['end_time'],
            start_date      = schedule['start_date'],
            end_date        = schedule['end_date'];

        console.log(`req.body: ${JSON.stringify(req.body)}`);
        // if we use short circuit evaluation on schedule['second'] to assign a value, and if schedule['second'] is 0, then this value will be ignored
        // and the right operand will be returned. This is not the behavior we want as second, minute, hour and month values can be 0
        let sanitize_input = (input) => {return (Number(input) === 0) ? Number(input) : Number(input) || undefined};
        console.log(`in validateScheduleInputs with ${JSON.stringify(schedule)}`);


        let buildValidSchedule = function(schedule){
            if(schedule === undefined) return schedule;
            let validSchedule = {}
            const 
                second    = sanitize_input(schedule['second']),
                minute    = sanitize_input(schedule['minute']),
                hour      = sanitize_input(schedule['hour']),
                dayOfWeek = (schedule['dayOfWeek']) ? Array.from(schedule['dayOfWeek']) : undefined,
                today     = new Date();
            console.log(`Trying to validate schedule - ${second}`);
            // Validate second input
            if(second !== undefined && !second.isNaN && Number.isInteger(second)){
                if(second >= MIN_SECOND && second <= MAX_SECOND)
                    validSchedule['second'] = second;
                else 
                    throw new Error(`second input must be >= ${MIN_SECOND} or <= ${MAX_SECOND}`);
            }else 
                throw new Error(`Invalid second input! - ${second}`);
            // Validate minute input
            if(minute !== undefined && !minute.isNaN && Number.isInteger(minute)){
                if(minute >= MIN_MINUTE && minute <= MAX_MINUTE)
                    validSchedule['minute'] = minute;
                else 
                    throw new Error(`Minute input must be >= ${MIN_MINUTE} or <= ${MAX_MINUTE}`);
            }else 
                throw new Error("Invalid minute input!");
            // Validate hour input
            if(hour !== undefined && !hour.isNaN && Number.isInteger(hour)){
                if(hour >= MIN_HOUR && hour <= MAX_HOUR)
                    validSchedule['hour'] = hour;
                else 
                    throw new Error(`Minute input must be >= ${MIN_HOUR} or <= ${MAX_HOUR}`)
            }else 
                throw new Error("Invalid hour input!");
            // Validate Inputs for Day of Week Based Scheduling
            if(dayOfWeek !== undefined && dayOfWeek.length){
                console.log(`validating dayOfWeek: ${dayOfWeek}`);
                let dayOfWeekArr = dayOfWeek.map(function(day){
                    // dayOfWeek = 0 - 6
                    if(!Number.isNaN(day) && Number(day) >= MIN_DOW && Number(day) <= MAX_DOW)
                        return parseInt(day);
                    else throw new Error("Invalid day of week input.");
                });
                validSchedule['dayOfWeek'] = dayOfWeekArr; 
            }
            return validSchedule;
        }
        let buildValidDate = function(dateObj, schedule){
            let validDate = {},
                second    = sanitize_input(schedule['second']),
                minute    = sanitize_input(schedule['minute']),
                hour      = sanitize_input(schedule['hour']),
                date      = sanitize_input(dateObj['date'])  || undefined,
                month     = sanitize_input(dateObj['month']),
                year      = Number(dateObj['year']) || undefined,
                today     = new Date();


            // valid date based scheduling details
            if(date !== undefined && month !== undefined && year !== undefined){
                if(date >= MIN_DATE && date <= MAX_DATE)
                    validDate['date'] = date;
                else 
                    throw new Error(`Date input must be >= ${MIN_DATE} or <= ${MAX_DATE}`);
                if(month >= MIN_MONTH && month <= MAX_MONTH)
                    validDate['month'] = month;
                else 
                    throw new Error(`Month input must be >= ${MIN_MONTH} or <= ${MAX_MONTH}`);
                if(year >= MIN_YEAR){
                    validDate['year'] = year;
                    //let scheduleTestDate = new Date(year, month, date, hour, minute, second, 0);
                    let scheduleTestDate = new Date(year, month, date, hour, minute, second);  
                    console.log(`scheduleTestObj: ${scheduleTestDate}`);
                    console.log(`today: ${today}`);
                    // if(scheduleTestObj < today) 
                    //     throw new Error("Schedule must occur in the future!");
                    // if the schedule is past the start date, start it anyway. otherwise, an invalid cronjob will be created
                    if(scheduleTestDate < today){
                        throw new Error("ScheduleTestDate < today");
                        // delete scheduleObj['date'];
                        // delete scheduleObj['month'];
                        // delete scheduleObj['year'];
                    }else{
                        console.log(`scheduleTestDate > today`);
                    }
                }else 
                    throw new Error(`Year input must be >= ${MIN_MONTH}  or <= ${MAX_MONTH}`);
            }
            return validDate;
        }

        try{
            if(start_time)
                schedule_config['schedule']['start_time'] = buildValidSchedule(start_time);
            if(end_time)
                schedule_config['schedule']['end_time'] = buildValidSchedule(end_time);
            if(start_date)
                schedule_config['schedule']['start_date'] = buildValidDate(start_date, start_time);
            if(end_date)
                schedule_config['schedule']['end_date'] = buildValidDate(end_date, end_time);
            console.log(`schedule_config before adding to req.body: ${JSON.stringify(schedule_config)}`);
            req.body = schedule_config;
            console.log(`req.body: ${JSON.stringify(req.body)}`);
            next();

        }catch(exc){
            res.status(400).send(exc.toString());
        }    
    },
    validateDeviceInputs(req, res, next){

    }
}
module.exports = scheduleMiddleware;
