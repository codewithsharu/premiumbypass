const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const User = require('./models/User');
const path = require('path');

const app = express();
const PORT = 3000;

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://temp:Fgouter55%23@cluster0.bblcm.mongodb.net/envunlock?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Session store setup
const store = new MongoDBStore({
    uri: MONGODB_URI,
    collection: 'sessions',
    expires: 1800000 // 30 minutes
});

// Middleware setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
        maxAge: 1800000 // 30 minutes
    }
}));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/login');
    }
    next();
};

// Basic proxy configuration
const proxy = createProxyMiddleware({
    target: 'https://env-softeesolutions.bestserver.host',
    changeOrigin: true,
    secure: false,
    ws: true,
    logLevel: 'debug',
    onProxyRes: function(proxyRes, req, res) {
        if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
            delete proxyRes.headers['content-length'];
            proxyRes.headers['transfer-encoding'] = 'chunked';
            
            let body = '';
            proxyRes.on('data', function(chunk) {
                body += chunk;
            });
            
            proxyRes.on('end', function() {
                // Remove datadog scripts
                body = body.replace(/<script[^>]*datadog[^>]*>[\s\S]*?<\/script>/gi, '');
                
                // Remove watermark div
                body = body.replace(/<div[^>]*id=["']watermarckk["'][^>]*>[\s\S]*?<\/div>/gi, '');
                
                // Add our blocking code at the very start of head
                const injection = `
                    <script>
                        // Block datadog scripts
                        const originalCreateElement = document.createElement.bind(document);
                        document.createElement = function(tagName) {
                            const element = originalCreateElement(tagName);
                            if (tagName.toLowerCase() === 'script') {
                                const originalSetAttribute = element.setAttribute.bind(element);
                                element.setAttribute = function(name, value) {
                                    if (name === 'src' && value.includes('datadog')) {
                                        return; // Block datadog scripts
                                    }
                                    return originalSetAttribute(name, value);
                                };
                            }
                            return element;
                        };
                    </script>
                    <style>
                        #watermarckk, div[id*="watermar"], [id*="watermar"] { 
                            display: none !important; 
                            opacity: 0 !important;
                            visibility: hidden !important;
                            position: fixed !important;
                            top: -9999px !important;
                            left: -9999px !important;
                            z-index: -9999 !important;
                            pointer-events: none !important;
                            width: 0 !important;
                            height: 0 !important;
                        }
                    </style>
                `;
                
                // Insert our code at the start of head
                body = body.replace('<head>', '<head>' + injection);
                res.end(body);
            });
        } else {
            // Block datadog requests
            if (req.url.includes('datadog')) {
                res.status(404).end();
                return;
            }
            proxyRes.pipe(res);
        }
    },
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'en-US,en;q=0.9'
    }
});

// Add this route before the login routes
app.get('/setup', async (req, res) => {
    try {
        // First try to find if user already exists
        const existingUser = await User.findOne({ username: 'test' });
        if (existingUser) {
            return res.send('Default user already exists!<br>Username: test<br>Password: 123<br><br><a href="/login">Go to Login</a>');
        }

        // Create new default user
        const newUser = new User({
            username: 'test',
            password: '123'
        });
        await newUser.save();
        res.send('Default user created successfully!<br>Username: test<br>Password: 123<br><br><a href="/login">Go to Login</a>');
    } catch (error) {
        res.send('Error creating user: ' + error.message);
    }
});

// Login routes
app.get('/login', (req, res) => {
    if (req.session.isAuthenticated) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        console.log('Login attempt for username:', username);
        const user = await User.findOne({ username });
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.log('No user found with username:', username);
            return res.render('login', { error: 'Invalid username or password' });
        }

        // Simple direct password comparison
        if (user.password !== password) {
            console.log('Password did not match');
            return res.render('login', { error: 'Invalid username or password' });
        }

        req.session.isAuthenticated = true;
        req.session.user = { id: user._id, username: user.username };
        console.log('Login successful, redirecting...');
        res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'An error occurred. Please try again.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Block datadog requests at router level
app.use((req, res, next) => {
    if (req.url.includes('datadog')) {
        res.status(404).end();
        return;
    }
    next();
});

// Protected routes
app.use('/', isAuthenticated, proxy);

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
}); 