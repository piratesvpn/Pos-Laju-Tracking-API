var nodemailer = require("nodemailer");

var async = require("async");

var poslajutracking = require("../lib/poslajutracking_lib.js");

// Add uncaught-exception handler in prod-like environments
if (geddy.config.environment != "development") {
	process.addListener("uncaughtException", function (err) {
		var msg = err.message;
		if (err.stack) {
			msg += "\n" + err.stack;
		}
		if (!msg) {
			msg = JSON.stringify(err);
		}
		geddy.log.error(msg);
	});
}

// create reusable transport method (opens pool of SMTP connections)
var smtpTransport = nodemailer.createTransport("SMTP", {
	//service: "Gmail",
	host: "mail.alif.my",
	// hostname
	port: 587,
	// port for secure SMTP
	auth: {
		user: "noreply@alif.my",
		pass: "abcd1234"
	}
});

var capitaliseFirstLetter = function(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

//Cron job to fetch parcel delivery status
var cronJob = require("cron").CronJob;

// 0 7-18 * * *
var job = new cronJob("*/1 * * * *", function () {
	geddy.model.Parcel.all({
		delivered: 0
	}, function (err, data) {
		var parceldata = data;
		if (err) {
			throw err;
		}
		// this is going to be costly. So... refactoring mgkin diperlukan later.
		if (parceldata.length > 0) {
			async.map(parceldata, function (parcelObj, callback) {
				//geddy.log.info("Sched Running: " + parcelObj.posid);
				poslajutracking.parseTrackingID(parcelObj.posid, null, null, function (respObj) {
					// if the parcel has any data..
					if (respObj.data.length > 0) {
						if (parcelObj.status !== respObj.data[0].process) {
							// if the parcel successfullt delivered, set the delivered flag to 1.
							if (respObj.data[0].process.search("Delivered") != -1) {
								parcelObj.updateProperties({
									delivered: 1
								});
							}
							// save the current status
							parcelObj.updateProperties({
								status: respObj.data[0].process
							});
							//console.log(parcelObj.posid);
							parcelObj.save();
							// setup e-mail data with unicode symbols
							var mailOptions = {
								from: "Pos Laju Tracking Service <noreply@alif.my>",
								bcc: parcelObj.ccnotifyemail,
								//replyTo: parcelObj.submitterID,
								// sender address
								//to: "bar@blurdybloop.com, baz@blurdybloop.com", // list of receivers
								to: parcelObj.notifyemail,
								subject: "Parcel Status - " + parcelObj.posid + " - " + capitaliseFirstLetter(parcelObj.postitle),
								// Subject line
								// plaintext body
								html: "<h3>"+ capitaliseFirstLetter(parcelObj.postitle)  +"</h3>Process: " + respObj.data[0].process + "<br />" + "Office: " + respObj.data[0].office + "<br />" + "Date: " + respObj.data[0].date
							};
							// send mail with defined transport object
							smtpTransport.sendMail(mailOptions, function (error, response) {
								if (error) {
									geddy.log.error("Error: " + error);
								} else {
									geddy.log.info("EMAIL: " + response);
								}
							});
						}
					}
				});
			}, function (err, stats) {
				if (err) { geddy.log.error("Error: " + error); } else {}
			});
		}
	});
}, function () {}, true, "Asia/Kuala_Lumpur");
