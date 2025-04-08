const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Root route for testing basic server
app.get('/', (req, res) => {
  res.send('Welcome to AI Content Assistant API!');
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Mongoose Schemas
const organizationSchema = new mongoose.Schema({
  orgName: String,
  brandGuide: String,
  goals: String,
  personas: String,
  stylePreferences: String,
});

const promptSchema = new mongoose.Schema({
  orgName: String,
  prompt: String,
  content: String,
  rating: Number,
  feedback: String,
});

const Organization = mongoose.model('Organization', organizationSchema);
const Prompt = mongoose.model('Prompt', promptSchema);

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Onboard an organization
app.post('/api/onboard', async (req, res) => {
  const { orgName, brandGuide, goals, personas, stylePreferences } = req.body;
  if (!orgName || !brandGuide || !goals || !personas || !stylePreferences) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await Organization.create({ orgName, brandGuide, goals, personas, stylePreferences });
    res.status(200).json({ message: 'Organization onboarded successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error saving organization' });
  }
});

// Generate content with OpenAI
app.post('/api/generate', async (req, res) => {
  const { orgName, prompt } = req.body;
  if (!orgName || !prompt) {
    return res.status(400).json({ error: 'orgName and prompt are required' });
  }

  try {
    const org = await Organization.findOne({ orgName });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const systemPrompt = `You are a content strategist. Use the following brand details to generate helpful marketing content.\n\nBrand Guide: ${org.brandGuide}\nGoals: ${org.goals}\nStyle: ${org.stylePreferences}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices[0].message.content;
    await Prompt.create({ orgName, prompt, content });

    res.status(200).json({ content });
  } catch (err) {
    console.error('🔥 OpenAI Error:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'Error generating content' });
  }
});

// Rate the content
app.post('/api/rate', async (req, res) => {
  const { orgName, prompt, rating, feedback } = req.body;
  if (!orgName || !prompt || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Missing required fields or invalid rating' });
  }

  try {
    const entry = await Prompt.findOne({ orgName, prompt });
    if (!entry) return res.status(404).json({ error: 'Prompt not found for this organization' });

    entry.rating = rating;
    entry.feedback = feedback;
    await entry.save();

    res.status(200).json({ message: 'Feedback recorded' });
  } catch (err) {
    res.status(500).json({ error: 'Error saving feedback' });
  }
});

// Analytics
app.get('/api/analytics/:orgName', async (req, res) => {
  const { orgName } = req.params;
  try {
    const prompts = await Prompt.find({ orgName });
    if (!prompts.length) return res.status(404).json({ error: 'No data found for this organization' });

    const avgRating = prompts.reduce((sum, p) => sum + (p.rating || 0), 0) / prompts.length;

    res.status(200).json({
      totalGenerated: prompts.length,
      averageRating: avgRating.toFixed(2),
      last5Feedbacks: prompts.slice(-5).map(p => ({
        prompt: p.prompt,
        rating: p.rating,
        feedback: p.feedback,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching analytics' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 AI Content Assistant backend running on http://localhost:${port}`);
});
