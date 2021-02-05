let Gpio = require('onoff').Gpio;
//https://www.npmjs.com/package/onoff
class RelaySettings{
	#relayId
	#direction
	#gpio
	#relayType
	constructor(relaySettings){
		this.#relayId 	= relaySettings['relayId'];
		this.#direction = relaySettings['direction'];
		this.#gpio 		= relaySettings['gpio'];
		this.#relayType = relaySettings['relayType'];
	}
	/*************************** RelaySettings GETTERS ***************************/
	get relayId() {  return this.#relayId;	 }
	get direction(){ return this.#direction; }
	get gpio()     { return this.#gpio; 	 }
	get relayType(){ return this.#relayType; }
	/*************************** RelaySettings SETTERS ***************************/
	set direction(direction){ this.#direction = direction; }
	set gpio(gpio)			{ this.#gpio      = gpio; 	   }
	set relayType(relayType){ this.#relayType = relayType; }
}
class Outlet extends RelaySettings{
	#outlet
	#initialState 
	#options = { reconfigureDirection: true }
	#direction
	constructor(relay_settings){
		super(relay_settings);
		console.log(`in outlet const with: ${JSON.stringify(relay_settings)}`);
		this.#outlet = new Gpio(this.gpio, this.direction, this.options);
		// if readSync() is 1 after initializing the GPIO, this does not mean it's on, it's really off
		// store the initialState so we can return the correct status and activate the outlet to the
		// correct state
		this.#initialState = this.outlet.readSync();
		console.log(`initialState: ${this.#initialState}`);
	}
	get outlet()	  { return this.#outlet;	   }
	get initialState(){ return this.#initialState; }
	get options()     { return this.#options;      }
	get status(){
		let current_state = this.outlet.readSync();
		if(this.#initialState) current_state ^= 1;
		return current_state;
		//return (this.#initialState) ? this.outlet.readSync() ^= 1 : this.outlet.readSync();
	}
	set activate(desired_state){
		if(this.status === desired_state){
			console.log("Device is already in the desired state!");
		}else{
			if(this.#initialState) desired_state ^= 1;
			this.outlet.writeSync(desired_state);
		}
	}
	set reconfigureDirection(direction){
		this.#direction = direction;
		this.#outlet.setDirection(direction);
	}
	updateOutlet(gpio, direction){
		this.outlet.unexport();
		this.gpio = gpio;
		this.direction = direction;
		this.outlet = new Gpio(this.gpio, this.direction);
	}
}
class OutletBuilder{
	withRelaySettings(relay_settings){
		console.log(`in withRelaySettings: ${JSON.stringify(relay_settings)}`);
		this.relay_settings = relay_settings;
		return this;
	}
	build(){
		console.log(`in OutletBuilder with: ${JSON.stringify(this.relay_settings)}`);
		return new Outlet(this.relay_settings);
	}
}
module.exports = OutletBuilder;