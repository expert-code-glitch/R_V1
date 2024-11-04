require('dotenv').config();

const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const moment = require('moment');
const  serviceAccount = require("./serviceAccountKey.json");
const app = express(); // Correctly create an Express app
const sgMail = require('@sendgrid/mail');
const path = require('path');
/*******Constant **********/
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const port = 5000;

app.use(cors({
    origin: "http://localhost:3000",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
app.options('*', cors());
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://realtimemvp-a9dca-default-rtdb.firebaseio.com"
});


app.use(express.json());
app.use(bodyParser.json());

// ... existing code ...

// Ensure the correct path is set for static files
app.use(express.static(path.join(__dirname, 'build')));

// ... existing code ...

const [pro] = ['price_1QGNgpKTEcRvi4XY2OOslmtS'];



const  stripe = require('stripe')(process.env.STRIPE_PRIVATE_KEY)

/************ Create Subscription ************/
const stripeSession = async(plan) =>{
    try {
        const session =  await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items:[
                {
                    price: plan,
                    quantity : 1
                }
            ],
            success_url : "http://localhost:3000/success",
            cancel_url : "http://localhost:3000/cancel"
        })
        return session;
    }
    catch(e){
        console.log(e);
    }
};

app.post("/api/v1/create-subscription-checkout-session", async (req, res) =>{
    const {plan, customerId} = req.body;
    let planId = null;
    if(plan == 9.99) planId = pro;
    try{
        const session = await stripeSession(planId);
        const  user = await admin.auth().getUser(customerId);
        await admin.database().ref('users').child(user.uid).update({
            subscription: {
                sessionId: session.id
            }
        });
        console.log(session.url);
        return res.json(session);
    }
    catch(error){
        res.send(error)
    }
})

/*********** Payment Success ************/
app.post("/api/v1/payment-success", async (req, res) => {
    const { sessionId, firebaseId } = req.body;

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === "paid") {
            const subscriptionId = session.subscription;
            try {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const user = await admin.auth().getUser(firebaseId);
                const planId = subscription.plan.id;
                let planType = "";

                if (subscription.plan.amount === 999) planType = "pro";
                else planType = 'free';

                const startDate = moment.unix(subscription.current_period_start).format("YYYY-MM-DD");
                const endDate = moment.unix(subscription.current_period_end).format("YYYY-MM-DD");
                const durationInSeconds = subscription.current_period_end - subscription.current_period_start;
                const durationInDays = moment.duration(durationInSeconds, 'seconds').asDays();

                await admin.database().ref("users").child(user.uid).update({
                    subscription:{
                        sessionId : null,
                        planId : planId,
                        planType : planType,
                        planStartDate : startDate,
                        planEndDate : endDate,
                        planDuration : durationInDays
                    }
                })
            }
            catch(error){
                console.log(error)
            }
            return res.json({message: "Payment Successful"} ) 
        }
        else {
            return res.json({message: "Payment Failed"} ) 
        }
    } catch (error) {
        res.send(error);
    }
})

/*************** Contact ****************/


app.post('/api/v1/send_email', (req, res) => {
    const { email, subject, title, content } = req.body;

    const msg = {
        to: 'sean993993@gmail.com',
        from: 'codeexpert74@gmail.com',
        subject: subject,
        html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${subject}</title>
                <style>
                    /* Your email styles here */
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${title}</h1>
                    </div>
                    <div class="content">
                        <h2>Dear, Stiven</h2>
                        This email originated from ${email}.
                        ${content}
                    </div>
                    <div class="footer">
                        
                        <p>You're receiving this email because you signed up for our newsletter.</p>
                        <p><a href="https://www.salesup.com/unsubscribe">Unsubscribe</a> | <a href="https://www.salesup.com">View in Browser</a></p>
                    </div>
                </div>
            </body>
            </html>
        `,
    };

    sgMail.send(msg)
        .then(() => {
            res.json({ message: 'Email sent successfully' });
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while sending the email' });
        });
});


app.listen(port, () => { // Corrected the typo here
    console.log(`Now listening on port ${port}`);
});


