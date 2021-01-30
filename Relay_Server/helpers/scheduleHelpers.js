let Scheduler       = require("../models/scheduler"),
    Device          = require("../models/device"),
    node_schedule   = require('node-schedule'),
    ip              = require("ip"),
    JobBuilder      = require("../classes/job");
    localIP         = ip.address();

let scheduleHelpers = {
    scheduleObj: {},
    doesScheduleExist: function(schedule_id){
        return schedule_id in this.scheduleObj;
    },
    getScheduleJobById: function(schedule_id){
        if(!this.doesScheduleExist(schedule_id))
            return undefined;
        return this.scheduleObj[schedule_id];
    },
    getScheduleConfigById: function(schedule_id){
        if(!this.doesScheduleExist(schedule_id))
            return undefined;
        return this.scheduleObj[schedule_id].schedule_config;
    },
    getDateOfNextInvocation: function(schedule_id){
        let job = this.getScheduleJobById(schedule_id);
        if(job === undefined)
            return job;
        return job.nextInvocationDate;
        //return job.nextInvocationDate;        
    },
    // invalidates any job. All  planned invocations will be canceled
    cancelSchedule: function(schedule_id){
        let job = this.getScheduleJobById(schedule_id);
        if(job){
            console.log(`Next Schedule before ${job.nextInvocationDate} being canceled`);
            job.cancelJob();
            console.log(`Next Schedule after being ${job.nextInvocationDate} canceled`)
        }
    },
    // invalidates the next planned invocation
    cancelNextSchedule: function(schedule_id, activateRelayFn, context){
        let job = this.getScheduleJobById(schedule_id);
        if(job){
            console.log(`Next Schedule before ${job.nextInvocationDate} being canceled`);
            job.cancelNextJob();
            console.log(`Next Schedule after being ${job.nextInvocationDate} canceled`)
        }
    },
    startActiveSchedules: function(activateRelayFn, context){
        let today = new Date();
        for(const [schedule_id, job] of Object.entries(this.scheduleObj)){
            console.log(`key: ${schedule_id} value: ${JSON.stringify(job)}`);
            let schedule_config = job.schedule_config,
                device_gpio     = schedule_config['device']['gpio'],
                desired_state   = schedule_config['device']['desired_state'],
                nextScheduleId  = schedule_config['relational']['nextScheduleId'];

            if(nextScheduleId === undefined)
                console.log("nextScheduleId is undefined");
            else{
                let isScheduleActive = this.scheduleIsActive(schedule_config, today);
                    if(isScheduleActive === true)
                        activateRelayFn.call(context, device_gpio, desired_state);
            }
        }
    },
    resumeSchedule: function(schedule_id, fn, context){
        let self            = this,
            reschedule      = true,
            today           = new Date(),
            schedule_config = self.getScheduleConfigById(schedule_id);
            
        if(schedule_config === undefined){
            console.log("Schedule config is undefined");
        }else{
            let device_gpio   = schedule_config['device']['gpio'],
                desired_state = schedule_config['device']['desired_state'],
                jobArgs       = [fn, context, device_gpio, desired_state],
                job           = new JobBuilder()
                    .withSchedule(schedule_config['schedule'])
                    .withRelational(schedule_config['relational'])
                    .withDevice(schedule_config['device'])
                    .withJobFunction(...jobArgs)
                    .build()

            self.scheduleObj[schedule_config['_id']] = job;
            self.startActiveSchedules(activateRelayFn, context);
        }
        
    },
    createSchedule: async function(new_schedule_config, fn, context, ...args){
        let self            = this,
            device_gpio     = new_schedule_config['device']['gpio'],
            desired_state   = new_schedule_config['device']['desired_state'],
            jobArgs         = [fn, context, ...args, device_gpio, desired_state],
            job             = new JobBuilder()
                .withSchedule(new_schedule_config['schedule'])
                .withRelational(new_schedule_config['relational'])
                .withDevice(new_schedule_config['device'])
                .withJobFunction(...jobArgs)
                .build()

        let newScheduleResponse = await Scheduler.create(new_schedule_config);
    
        if(newScheduleResponse === undefined)
            return newScheduleResponse;
        else{
            let schedule_id  = newScheduleResponse["_id"];
            self.scheduleObj[schedule_id] = job;
            return schedule_id;
        }
    },
    // Finds schedules (by the GPIO we are checking against) that would occur on the same day
    // and returns the indices refering to those schedules in our scheduleArr
    findSameDaySchedulesAndRetIds: function(schedule_config){
        let self      = this,
            date      = schedule_config['schedule']['date']  || undefined,
            month     = schedule_config['schedule']['month'] || undefined,
            year      = schedule_config['schedule']['year']  || undefined,
            gpio      = Number(schedule_config['device']['gpio'])    || undefined,
            dayOfWeek = (schedule_config['schedule']['dayOfWeek']) ? Array.from(schedule_config['schedule']['dayOfWeek']) : undefined,
            timestamp = new Date(),
            indices   = [],
            intersect = function(a, b){
                return a.filter(Set.prototype.has, new Set(b));
            };
            
        console.log(`schedule_config in findSameDay..${JSON.stringify(schedule_config)}`);

        // recurrence based scheduling
        if(dayOfWeek !== undefined && dayOfWeek.length){ 
            console.log("Recurrence Based Scheduling");
            // loop through our schedules and find another schedule that runs on same days as the schedule we are trying to add
            for(const [schedule_id, job] of Object.entries(self.scheduleObj)){
                let schedule_config = job.schedule_config,
                    sched_second    = schedule_config['schedule']['second']|| undefined,
                    sched_minute    = schedule_config['schedule']['minute']|| undefined,
                    sched_hour      = schedule_config['schedule']['hour']  || undefined,
                    sched_date      = schedule_config['schedule']['date']  || undefined,
                    sched_month     = schedule_config['schedule']['month'] || undefined,
                    sched_year      = schedule_config['schedule']['year']  || undefined,
                    sched_gpio      = schedule_config['device']['gpio']    || undefined,
                    sched_dayOfWeek = schedule_config['schedule']['dayOfWeek'] ? Array.from(schedule_config['schedule']['dayOfWeek']) : undefined;
                if(schedule_config['relational']['nextScheduleId'] !== undefined && gpio === sched_gpio){
                    // recurrence based schedule compared to recurrence based scheduling
                    if(sched_dayOfWeek !== undefined && sched_dayOfWeek.length){
                        // the times these schedules are set for are all the same for recurrence based scheduling
                        let common_days = intersect(dayOfWeek, sched_dayOfWeek);
                        // are there common days between these recurrence-based schedules?
                        if(common_days.length > 0)
                            indices.push(schedule_id);
                    }
                    // recurrence based scheduling compared to date based scheduling
                    else if (sched_date !== undefined && sched_month !== undefined && sched_year !== undefined){
                        let sched_timestamp = new Date(sched_year, sched_month, sched_date, sched_hour, sched_minute, sched_second);
                        let sched_numDay = sched_timestamp.getDay();
                        if(dayOfWeek.includes(sched_numDay))
                            indices.push(schedule_id);
                    }
                    // otherwise, recurrence based scheduling compared check to daily 1 time - off schedules
                    else
                        indices.push(schedule_id);
                }
            }
        }
        // date based scheduling
        else if(date !== undefined && month !== undefined && year !== undefined){ 
            // loop through our schedules and find another schedule that runs on same days as the schedule we are trying to add
            for(const [schedule_id, job] of Object.entries(self.scheduleObj)){
                let schedule_config = job.schedule_config,
                    sched_date      = schedule_config['schedule']['date'] || undefined,
                    sched_month     = schedule_config['schedule']['month']|| undefined,
                    sched_year      = schedule_config['schedule']['year'] || undefined,
                    sched_gpio      = schedule_config['device']['gpio']   || undefined,
                    sched_dayOfWeek = (schedule_config['schedule']['dayOfWeek']) ? Array.from(schedule_config['schedule']['dayOfWeek']) : undefined;
                
                if(schedule_config['relational']['nextScheduleId'] !== undefined && gpio === sched_gpio){
                    // date based scheduling compared to recurrence based scheduling
                    if(sched_dayOfWeek !== undefined && sched_dayOfWeek.length){
                        let datebased_timestamp = new Date(year, month, date, hour, minute, second);
                        let datebased_numDay = datebased_timestamp.getDay();
                        
                        if(sched_dayOfWeek.includes(datebased_numDay))
                            indices.push(schedule_id);
                    }
                    // date based scheduling compared to date based scheduling
                    else if (sched_date !== undefined && sched_month !== undefined && sched_year !== undefined){
                        if(date === sched_date && month === sched_month && year === sched_year)
                            indices.push(schedule_id);
                    }
                    // otherwise, date based scheduling compared check to 1 time - off schedules
                    else
                        indices.push(schedule_id);
                }
            }
        }
        // otherwise, everyday 1 time - off schedules
        else{
            console.log(`everyday 1 time schedules`);
            // loop through our schedules and find another schedule that runs on same days as the schedule we are trying to add
            for(const [schedule_id, job] of Object.entries(self.scheduleObj)){
                let schedule_config = job.schedule_config,
                    sched_date      = schedule_config['schedule']['date']  || undefined,
                    sched_month     = schedule_config['schedule']['month'] || undefined,
                    sched_year      = schedule_config['schedule']['year']  || undefined,
                    sched_gpio      = schedule_config['device']['gpio']    || undefined,
                    sched_dayOfWeek = (schedule_config['schedule']['dayOfWeek']) ? Array.from(schedule_config['schedule']['dayOfWeek']) : undefined;
                console.log(`Iterating through schedules`);
                if(schedule_config['relational']['nextScheduleId'] !== undefined && gpio === sched_gpio){
                //if(schedule_obj["_id"] !== schedule_id){
                    // everyday 1 time - off schedules compared to recurrence based scheduling
                    if(sched_dayOfWeek !== undefined && sched_dayOfWeek.length)
                        indices.push(schedule_id);
                    // everyday 1 time - off schedules compared to date based scheduling
                    else if (sched_date !== undefined && sched_month !== undefined && sched_year !== undefined)
                        indices.push(schedule_id);
                    // otherwise, 1 time - off schedules compared check to everyday 1 time - off schedules
                    else
                        indices.push(schedule_id);
                }else{
                    console.log(`nextScheduleId: ${schedule_config['relational']['nextScheduleId']}`);
                }
            }
        }
        console.log(`schedule ids: ${indices}`);
        return indices;
    },
    isScheduleOverlapping: function(on_schedule_config, off_schedule_config){
        let self              = this,
            new_on_second     = on_schedule_config['schedule']['second'],
            new_on_minute     = on_schedule_config['schedule']['minute'],
            new_on_hour       = on_schedule_config['schedule']['hour'  ],
            
            new_off_second    = off_schedule_config['schedule']['second'],
            new_off_minute    = off_schedule_config['schedule']['minute'],
            new_off_hour      = off_schedule_config['schedule']['hour'], 
            new_on_timestamp  = new Date(),
            new_off_timestamp = new Date();
            
        let conflictMsg       = "",
            schedule_ids      = [];
        
        console.log("in isScheduleOverlapping");
        console.log(`with: ${JSON.stringify(on_schedule_config)} and ${JSON.stringify(off_schedule_config)}`);

        new_on_timestamp.setHours(new_on_hour, new_on_minute, new_on_second);  
        new_off_timestamp.setHours(new_off_hour, new_off_minute, new_off_second);
        
        schedule_ids = self.findSameDaySchedulesAndRetIds(on_schedule_config);
        console.log(`same day schedule ids: ${schedule_ids}`);
        schedule_ids.forEach(function(schedule_id){
            // let sched_on_schedule_obj    = self.scheduleObj[schedule_id],
            //     sched_on_schedule_config = sched_on_schedule_obj.schedule_config,
            //     sched_on_second          = sched_on_schedule_config['schedule']['second'],
            //     sched_on_minute          = sched_on_schedule_config['schedule']['minute'],
            //     sched_on_hour            = sched_on_schedule_config['schedule']['hour'],
            //     sched_off_mongo_id       = sched_on_schedule_config['relational']['nextScheduleId'].toString(),
            //     sched_on_timestamp       = new Date();
            

            // let sched_off_schedule_obj    = self.scheduleObj[sched_off_mongo_id],
            //     sched_off_schedule_config = arr_off_schedule_obj.schedule_config,
            //     sched_off_second          = arr_off_schedule_config['schedule']['second'],
            //     sched_off_minute          = arr_off_schedule_config['schedule']['minute'],
            //     sched_off_hour            = arr_off_schedule_config['schedule']['hour'],
            //     sched_off_timestamp       = new Date();
                
            // sched_on_timestamp.setHours(sched_on_hour, sched_on_minute, sched_on_second);
            // sched_off_timestamp.setHours(sched_off_hour, sched_off_minute, sched_off_second);
            let sched_on_job          = self.scheduleObj[schedule_id],
                sched_off_mongo_id    = sched_on_job.schedule_config['relational']['nextScheduleId'].toString(),
                sched_on_timestamp    = sched_on_job.timestamp,
                sched_off_timestamp   = self.scheduleObj[sched_off_mongo_id].timestamp;

            console.log(`on_timestamp ${sched_on_timestamp}, timestamp: ${sched_on_timestamp}, off_timestamp" ${sched_off_timestamp}, timestamp1: ${sched_off_timestamp}`);
            
            let timestamp_options   = { hour: 'numeric', minute: 'numeric', hour12: true },
                fixed_on_timestamp  = new_on_timestamp.toLocaleString('en-US', timestamp_options),
                fixed_timestamp1    = sched_on_timestamp.toLocaleString('en-US', timestamp_options),
                fixed_timestamp2    = sched_off_timestamp.toLocaleString('en-US', timestamp_options),
                fixed_off_timestamp = new_off_timestamp.toLocaleString('en-US', timestamp_options);
            
            if(new_on_timestamp <= sched_on_timestamp && new_off_timestamp >= sched_off_timestamp)
               conflictMsg += `Schedule is overlapping`;
            
        });
        console.log(`conflictMsg: ${conflictMsg}`);
        return conflictMsg;
    },
    isScheduleConflicting: function(schedule_config){
        let self        = this,
            second      = schedule_config['schedule']['second'],
            minute      = schedule_config['schedule']['minute'],
            hour        = schedule_config['schedule']['hour'],
            timestamp   = new Date();
            
        let conflictMsg = "",
            indices     = [];

        console.log("in isScheduleConflicting");
        let handleScheduleConflictsMsg = function(isScheduleConflicting, schedule_obj){
            // is there a schedule conflict?
            if(isScheduleConflicting){
                console.log("In handleScheduleConflictsMsg");
                let second           = schedule_obj['schedule']['second'],
                    minute           = schedule_obj['schedule']['minute'],
                    hour             = schedule_obj['schedule']['hour'],
                    offScheduleId    = schedule_obj['relational']['nextScheduleId'].toString();
                    
                let on_timestamp     = new Date(),
                    off_timestamp    = new Date();
                    
                on_timestamp.setHours(hour, minute, second);
                
                if(self.doesScheduleExist(offScheduleId)){
                    let off_schedule_config = self.getScheduleConfigById(offScheduleId),
                        off_schedule_second = off_schedule_config['schedule']['second'],
                        off_schedule_minute = off_schedule_config['schedule']['minute'],
                        off_schedule_hour   = off_schedule_config['schedule']['hour'];
                        
                    off_timestamp.setHours(off_schedule_hour, off_schedule_minute, off_schedule_second);
                    let timestamp_options   = { hour: 'numeric', minute: 'numeric', hour12: true };
                    
                    let fixed_on_timestamp  = on_timestamp.toLocaleString('en-US', timestamp_options),
                        fixed_timestamp     = timestamp.toLocaleString('en-US', timestamp_options),
                        fixed_off_timestamp = off_timestamp.toLocaleString('en-US', timestamp_options);
                        
                    return `New Schedule timestamp - ${fixed_timestamp} Conflicts with ON - ${fixed_on_timestamp} and OFF - ${fixed_off_timestamp}`;
                }
                else
                    console.log(`Schedule does not exist`);
            }else // No Schedule Conflict Found
                return "";
            
        }
        timestamp.setHours(hour, minute, second);  
        
        schedule_ids = self.findSameDaySchedulesAndRetIds(schedule_config);
        console.log(`same day schedule ids: ${schedule_ids}`);
        schedule_ids.forEach(function(schedule_id){
            if(self.doesScheduleExist(schedule_id)){
                let schedule_config       = self.getScheduleConfigById(schedule_id),
                    isScheduleConflicting = self.scheduleIsActive(schedule_config, timestamp);

                conflictMsg += handleScheduleConflictsMsg(isScheduleConflicting, schedule_config);
            }
        });
        console.log(`conflictMsg: ${conflictMsg}`);
        return conflictMsg;
    },
    // Finds the next_schedule_config that's associated with the prev_schedule_config
    // and returns the boolean result of whether the 2nd argument, timestamp is greater than or equal to 
    // the timestamp within the prev_schedule_config object and is also less tan the timestamp within 
    // the next_schedule_config object
    // Comparison does not use date, or day of week, but assumes these schedules are happening on the same day
    scheduleIsActive: function(on_schedule_config, timestamp){
        let self = this,
            result = false,
            sanitize_input = (input) => {return (Number(input) === 0) ? Number(input) : Number(input) || undefined};
            
        // check to see if 1 of the schedules is active right now.
        if(on_schedule_config === undefined || on_schedule_config === null)
            return result;
        
        let on_schedule_second = sanitize_input(on_schedule_config['schedule']['second']),
            on_schedule_minute = sanitize_input(on_schedule_config['schedule']['minute']),
            on_schedule_hour   = sanitize_input(on_schedule_config['schedule']['hour']),
            desired_state      = Boolean(on_schedule_config['device']['desired_state']),
            onScheduleId       = on_schedule_config['relational']['prevScheduleId'],
            offScheduleId      = on_schedule_config['relational']['nextScheduleId'];
            
        // schedules could be loaded out of order. For example, we could be looking at the schedule that turns the outlet off. we need to first look at the schedule that turns the outlet on
        if(desired_state !== undefined && desired_state === true && onScheduleId === undefined && offScheduleId !== undefined){ // 'on' schedule
            console.log("Processing 'on' schedule");
            if(offScheduleId in this.scheduleObj){
                let on_schedule_timestamp  = new Date(),
                    off_schedule_timestamp = new Date(),
                    off_schedule_config    = self.scheduleObj[offScheduleId].schedule_config,
                    off_schedule_second    = sanitize_input(off_schedule_config['schedule']['second']),
                    off_schedule_minute    = sanitize_input(off_schedule_config['schedule']['minute']),
                    off_schedule_hour      = sanitize_input(off_schedule_config['schedule']['hour']);

                on_schedule_timestamp.setHours(on_schedule_hour, on_schedule_minute, on_schedule_second);
                off_schedule_timestamp.setHours(off_schedule_hour, off_schedule_minute, off_schedule_second);
                
                if(timestamp >= on_schedule_timestamp && timestamp < off_schedule_timestamp)
                    result = true;
            }else{ // schedule not found
                console.log("Off Schedule not found!!");
            }
            
        }else{
            console.log("There is a problem with the inputs given.")
            console.log(`desired_state: ${desired_state}`);
            console.log(`prevScheduleId:  ${onScheduleId}`);
            console.log(`nextScheduleId:  ${offScheduleId}`);
        }
        return result;
    },
    // gets all the schedules for this device from the database and stores them in the scheduleArr
    // if the schedule is active, then the associated outlet is activated
    getSchedules: function(activateRelayFn, context){
        let self = this,
            sanitize_input = (input) => {return (Number(input) === 0) ? Number(input) : Number(input) || undefined};

        Device.findOne({local_ip: localIP, deviceType: "Relay Server"}, function(err, myDevices){
            if(err){
                console.log(err);
            }else{
                
                try{
                   let deviceSchedulePromise = async () => { return await Scheduler.find({'device.id': myDevices["_id"]}); }
                   
                    deviceSchedulePromise().then(function(result){
                        console.log(`result: ${result}`);
                        return result;
                    }, function(err){
                        console.log(`err: ${err}`);
                    }).then(function(schedule_configs){
                        console.log(`schedule_configs: ${schedule_configs}`);
                        schedule_configs.forEach(function(schedule_config){
                            console.log(`schedule_config: ${schedule_config}`);

                            let startScheduleId = schedule_config['relational']['startScheduleId'],
                                device_gpio     = schedule_config['device']['gpio'],
                                desired_state   = schedule_config['device']['desired_state'];

                            let jobArgs = startScheduleId ? 
                                [self.deleteSchedule, self, startScheduleId.toString()] :
                                [activateRelayFn, context, device_gpio, desired_state];

                            let job = new JobBuilder()
                                .withSchedule(schedule_config['schedule'])
                                .withRelational(schedule_config['relational'])
                                .withDevice(schedule_config['device'])
                                .withJobFunction(...jobArgs)
                                .build()

                            self.scheduleObj[schedule_config['_id']] = job;
                        });
                        console.log(`Done processing schedules: ${JSON.stringify(self.scheduleObj)}`);
                        self.startActiveSchedules(activateRelayFn, context);
                    }).catch(function(err){
                        console.log(`Error caught: ${err}`);
                    })
                   
                }catch(err){
                    console.log(`Error caught: ${err}`);
                }
            }
        });
    },
    // schedule_id - the mongo id of the schedule we are trying to access and update
    // updated_schedule_config - the updated schedule configuration
    // activateRelayFn - the function that turns the outlet on/off
    // context - refers to the context that the activateRelayFn function resides in, without the context, activateRelayFn does not work
    // Updates a schedule by id, updates the schedule config in the scheduleArr and then places the associated outlet in the correct state
    // (on/off) since the new schedule details may require it to turn on or off based on whatever state the associated outlet was in beforehand
    editSchedule: function(schedule_id, updated_schedule_config, activateRelayFn, context){
        let self              = this,
            schedule_conflict = false,
            today             = new Date(),
            onScheduleId      = updated_schedule_config['relational']['prevScheduleId'] || undefined,
            offScheduleId     = updated_schedule_config['relational']['nextScheduleId'] || undefined,
            job               = self.getScheduleJobById(schedule_id);

        let updated_device     = updated_schedule_config['device'],
            updated_schedule   = updated_schedule_config['schedule'],
            updated_relational = updated_schedule_config['relational'];

        let updated_device_gpio   = updated_schedule_config['device']['gpio'],
            updated_desired_state = updated_schedule_config['device']['desired_state'];

        console.log(`schedule_id: ${schedule_id}`);
        console.log(`updateSchedule: ${JSON.stringify(updated_schedule_config)}`);
      
        if(!onScheduleId in self.scheduleObj)
            throw new Error("Invalid id provided for prevScheduleId");

        if(!offScheduleId in self.scheduleObj)
            throw new Error("Invalid id provided for nextScheduleId");
        
        console.log("about to cancel schedule");

        let args         = [updated_device_gpio, updated_desired_state],
            updatedJobFn = function(){ activateRelayFn.call(context, ...args); };
            

        job.updateSchedJobAndDevice(updated_device, updated_schedule, updated_relational, updatedJobFn);

        Scheduler.findByIdAndUpdate(schedule_id, {$set: updated_schedule_config}, (err, schedule) => {
            if(err){
                console.log(err);
                throw err;
            } else {
                console.log("Schedule canceled and removed!");

                //self.setSchedule(obj, index);
                // CHANGE NEEDED: does not account for updating the 'ON' schedule to an earlier time that would make the schedule be active
                //self.startActiveSchedules(activateRelayFn, context);
                
                
                if(onScheduleId !== undefined){ // updating off schedule?
                    console.log("updating off schedule");
                    // get the on schedule
                    // let onScheduleIndex  = self.findScheduleIndex(onScheduleId.toString()),
                    //     schedule_config  = self.scheduleArr[onScheduleIndex]['schedule_config'],
                    //     device_gpio      = schedule_config['device']['gpio'],
                    //     desired_state    = schedule_config['device']['desired_state'],
                    //     isScheduleActive = self.scheduleIsActive(schedule_config, today);
                        
                    // if(isScheduleActive === true){
                    //     console.log("Schedule is active");
                    //     console.log("Desired state is on");
                    //     activateRelayFn.call(context,  device_gpio, desired_state);     
                    // }
                    // else{
                    //     console.log("Schedule is not active");
                    //     activateRelayFn.call(context, device_gpio, 0);
                    // }
                }
                if(offScheduleId !== undefined){ // updating on schedule?
                    console.log("Updating on schedule");
                    // let schedule_config  = self.scheduleArr[index]['schedule_config'],
                    //     device_gpio      = schedule_config['device']['gpio'],
                    //     desired_state    = schedule_config['device']['desired_state'],
                    //     isScheduleActive = self.scheduleIsActive(schedule_config, today);
                    // if(isScheduleActive === true){
                    //     console.log("Schedule is active");
                    //     console.log("Desired state is on");
                    //     activateRelayFn.call(context,  device_gpio, desired_state);     
                    // }
                    // else{
                    //     console.log("Schedule is not active");
                    //     activateRelayFn.call(context, device_gpio, 0);
                    // }
                }

                self.startActiveSchedules(activateRelayFn, context);

                for(const [schedule_id, job] of Object.entries(self.scheduleObj)){
                    //console.log(`my schedule config: ${JSON.stringify(schedule_obj)}`);
                    let schedule_config = job.schedule_config,
                        desired_state  = schedule_config['device']['desired_state'],
                        prevSheduleId  = schedule_config['relational']['prevScheduleId'],
                        nextScheduleId = schedule_config['relational']['nextScheduleId'],
                        sched_id       = schedule_id.toString(),
                        device_gpio    = schedule_config['device']['gpio'];
                    
  
                    if(nextScheduleId === undefined)
                        console.log("nextScheduleId is undefined");
                    else{
                        nextScheduleId = nextScheduleId.toString();
                        // schedule_id is the schedule we are trying to see is active or not
                        if(sched_id === schedule_id || nextScheduleId === schedule_id){
                            let isScheduleActive = self.scheduleIsActive(schedule_config, today);
                            if(isScheduleActive === true && desired_state === true){
                                console.log("Schedule is active");
                                console.log("Desired state is on");
                                activateRelayFn.call(context,  device_gpio, desired_state);     
                            }
                            else{
                                console.log("Schedule is not active");
                                activateRelayFn.call(context, device_gpio, 0);
                            }    
                        }
                        
                    }
                }
            }
        });
    },
    updateScheduleRelationship: function(schedule_id, updated_schedule_config){
        let self              = this,
            schedule_conflict = false,
            today             = new Date(),
            onScheduleId      = updated_schedule_config['relational']['prevScheduleId'] || undefined,
            offScheduleId     = updated_schedule_config['relational']['nextScheduleId'] || undefined;

        Scheduler.findByIdAndUpdate(schedule_id, {$set: updated_schedule_config}, (err, schedule) => {
            if(err){
                console.log(err)
            }else{
                //updated_schedule_config["_id"] = schedule_id;
                console.log("successfully updated schedule");
                console.log(`Schedule before: ${JSON.stringify(self.scheduleObj[schedule_id].schedule_config)}`);
                self.scheduleObj[schedule_id].relational = updated_schedule_config['relational'];
                //self.scheduleObj[schedule_id]['schedule_config'] = updated_schedule_config;
                console.log(`Schedule After: ${JSON.stringify(self.scheduleObj[schedule_id].schedule_config)}`);
            }
        });
    },
    // // schedule_id - the mongo id of the schedule we are trying to access and delete
    // // Removes the schedule in the scheduleArr and deletes any schedules (next/prev/start/endScheduleId's) that are associated with it
    // // 1/8/2021 - deleting should turn off the associated outlet if it is somehow turned on
    deleteSchedule: function(schedule_id){
        console.log(`In deleteSchedule Function with ${schedule_id}`);
        let self = this;

        self.cancelSchedule(schedule_id);
        Scheduler.findByIdAndRemove(schedule_id, (err) => {
            if(err){
                console.log(err);
                throw err;
            }
            else{
                try{
                    let schedules = [schedule_id];
                    if(self.scheduleObj[schedule_id].schedule_config['relational']['prevScheduleId']){
                        let prevScheduleId = self.scheduleObj[schedule_id]['schedule_config']['relational']['prevScheduleId'];
                        console.log(`prevScheduleId: ${prevScheduleId}`);
                        schedules.push(prevScheduleId);

                        let onScheduleIndex = prevScheduleId;
                        console.log(`Associated On Schedule Index Found: ${onScheduleIndex}`);

                        if(self.scheduleObj[onScheduleIndex].schedule_config['relational']['endScheduleId']){
                            let endScheduleId = self.scheduleObj[onScheduleIndex].schedule_config['relational']['endScheduleId'];
                            schedules.push(endScheduleId.toString());
                        }
                        if(self.scheduleObj[schedule_id].schedule_config['relational']['endScheduleId']){
                            // end schedule wont have a set prev or next schedule
                            let endScheduleId = self.scheduleObj[schedule_id].schedule_config['relational']['endScheduleId'];
                            console.log(`endScheduleId: ${endScheduleId}`);
                            schedules.push(endScheduleId.toString());
                            // let endScheduleIndex = self.findScheduleIndex(endScheduleId.toString());
                            // console.log(`Associated End Schedule Index Found: ${endScheduleIndex}`);

                        }   
                    }else if(self.scheduleObj[schedule_id].schedule_config['relational']['nextScheduleId']){
                        let nextScheduleId = self.scheduleObj[schedule_id].schedule_config['relational']['nextScheduleId'];
                        console.log(`nextScheduleId: ${nextScheduleId}`);
                        console.log(`Associated Off Schedule Found`);
                        schedules.push(nextScheduleId);

                        let offScheduleIndex = nextScheduleId;
                        console.log(`Associated Off Schedule Index Found: ${offScheduleIndex}`);
                        
                        if(self.scheduleObj[offScheduleIndex].schedule_config['relational']['endScheduleId']){
                            let endScheduleId = self.scheduleObj[offScheduleIndex].schedule_config['relational']['endScheduleId'];
                            schedules.push(endScheduleId.toString());
                        }
                        if(self.scheduleObj[schedule_id].schedule_config['relational']['endScheduleId']){
                            // end schedule wont have a set prev or next schedule
                            let endScheduleId = self.scheduleObj[schedule_id].schedule_config['relational']['endScheduleId'];
                            console.log(`endScheduleId: ${endScheduleId}`);
                            schedules.push(endScheduleId);

                            // let endScheduleIndex = self.findScheduleIndex(endScheduleId.toString());
                            // console.log(`Associated End Schedule Index Found: ${endScheduleIndex}`);
                        }
                    }else if(self.scheduleObj[schedule_id].schedule_config['relational']['startScheduleId']){
                        console.log(`Associated Start Schedule Found`);
                        // start schedule wont have a set prev or next schedule since it would mess up a lot of functions in this file
                        let startScheduleId = self.scheduleObj[schedule_id].schedule_config['relational']['startScheduleId'];
                        console.log(`startScheduleId: ${startScheduleId}`);
                        schedules.push(startScheduleId.toString());

                        let startScheduleIndex = startScheduleId;
                        console.log(`Associated Start Schedule Index Found: ${startScheduleIndex}`);
                        // get the schedule associated with the startScheduleId
                        // see if the schedule is associated with an on or off schedule
                        // retrieve that on or off schedule if it exists and delete it       
                        if(self.scheduleObj[startScheduleIndex].schedule_config['relational']['nextScheduleId']){
                            // end schedule wont have a set prev or next schedule
                            let nextScheduleId = self.scheduleObj[startScheduleIndex].schedule_config['relational']['nextScheduleId'];
                            console.log(`nextScheduleId: ${nextScheduleId}`);
                            schedules.push(nextScheduleId);

                            let nextScheduleIndex = nextScheduleId;
                            console.log(`Associated End Schedule Index Found: ${nextScheduleIndex}`);
                            if(self.scheduleObj[nextScheduleIndex].schedule_config['relational']['endScheduleId']){
                                let endScheduleId = self.scheduleObj[nextScheduleIndex].schedule_config['relational']['endScheduleId'];
                                schedules.push(endScheduleId.toString());
                            }
                        }
                        if(self.scheduleObj[startScheduleIndex].schedule_config['relational']['prevScheduleId']){
                            // end schedule wont have a set prev or next schedule
                            let prevScheduleId = self.scheduleObj[startScheduleIndex].schedule_config['relational']['prevScheduleId'];
                            console.log(`endScheduleId: ${prevScheduleId}`);
                            schedules.push(prevScheduleId);

                            let prevScheduleIndex = prevScheduleId;
                            console.log(`Associated End Schedule Index Found: ${prevScheduleIndex}`);
                            if(self.scheduleObj[prevScheduleIndex].schedule_config['relational']['endScheduleId']){
                                let endScheduleId = self.scheduleObj[prevScheduleIndex].schedule_config['relational']['endScheduleId'];
                                schedules.push(endScheduleId.toString());
                            }
                        }
                    }else if(self.scheduleObj[schedule_id].schedule_config['relational']['endScheduleId']){
                        console.log(`Associated End Schedule Found`);
                        // end schedule wont have a set prev or next schedule
                        let endScheduleId = self.scheduleObj[schedule_id].schedule_config['relational']['endScheduleId'];
                        console.log(`endScheduleId: ${endScheduleId}`);
                        schedules.push(endScheduleId.toString());

                        let endScheduleIndex = endScheduleId;
                        console.log(`Associated End Schedule Index Found: ${endScheduleIndex}`);
                    
                        if(self.scheduleObj[endScheduleIndex].schedule_config['relational']['nextScheduleId']){
                            // end schedule wont have a set prev or next schedule
                            let nextScheduleId = self.scheduleObj[endScheduleIndex].schedule_config['relational']['nextScheduleId'];
                            console.log(`endScheduleId: ${nextScheduleId}`);
                            schedules.push(nextScheduleId);

                            let nextScheduleIndex = nextScheduleId;
                            console.log(`Associated End Schedule Index Found: ${nextScheduleIndex}`);
                            if(self.scheduleObj[nextScheduleIndex].schedule_config['relational']['endScheduleId']){
                                let endScheduleId = self.scheduleObj[startScheduleIndex].schedule_config['relational']['endScheduleId'];
                                schedules.push(endScheduleId.toString());
                            }
                        }
                        if(self.scheduleObj[endScheduleIndex].schedule_config['relational']['prevScheduleId']){
                            // end schedule wont have a set prev or next schedule
                            let prevScheduleId = self.scheduleObj[endScheduleIndex].schedule_config['relational']['prevScheduleId'];
                            console.log(`endScheduleId: ${prevScheduleId}`);
                            schedules.push(prevScheduleId);

                            let prevScheduleIndex = prevScheduleId;
                            console.log(`Associated End Schedule Index Found: ${nextScheduleIndex}`);
                            if(self.scheduleObj[prevScheduleIndex].schedule_config['relational']['endScheduleId']){
                                let endScheduleId = self.scheduleObj[prevScheduleIndex].schedule_config['relational']['endScheduleId'];
                                schedules.push(endScheduleId.toString());
                            }
                        }


                    }else{
                        console.log(`Unknown schedule found`);

                    }
                    console.log(`associated schedules found: ${schedules.toString()}`);
                    self.scheduleObj[schedule_id]['job'].cancel();
                    console.log(`Size of array Before removal: ${Object.keys(self.scheduleObj).length}`);
                    delete self.scheduleObj[schedule_id];
                    console.log(`Size of array after removal: ${Object.keys(self.scheduleObj).length}`);
                }
                catch(err){
                    console.log(`Error: ${err.toString()}`);

                    self.scheduleObj[schedule_id]['job'].cancel();
                    console.log(`Size of array Before removal: ${Object.keys(self.scheduleObj).length}`);
                    delete self.scheduleObj[schedule_id];

                    console.log(`Size of array after removal: ${Object.keys(self.scheduleObj).length}`);
                }
                
                // }else{

                    // check to see if the schedule is currently active

                    // self.scheduleArr[index]['job'].cancel();
                    // console.log(`Size of array Before removal: ${self.scheduleArr.length}`);
                    // self.scheduleArr.splice(index, 1);
                    // console.log(`Size of array after removal: ${self.scheduleArr.length}`);
                // }
            }
        });
    },
    deleteSchedules: function(...schedule_ids){
        let self = this;

        schedule_ids.forEach(function(schedule_id){
           
            Scheduler.findByIdAndRemove(schedule_id, (err) => {
                if(err){
                    console.log(err);
                    throw err;
                }
                else{
                    console.log("Canceling schedule");
                    self.cancelSchedule(schedule_id);
                    console.log("Back in deleteSchedules fn from cancelSchedule fn");
                    delete self.scheduleObj[schedule_id];
                    console.log(`Size of array: ${Object.keys(self.scheduleObj).length}`);
                }
            });
        });
    }
}
module.exports = scheduleHelpers;