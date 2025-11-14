const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'build')));

app.post('/api/claude', async (req, res) => {
  try {
    const { apiKey, messages, system, model, max_tokens } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    console.log(`[${new Date().toISOString()}] Claude API request - Model: ${model}`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 4096,
        system: system,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[${new Date().toISOString()}] API Error:`, errorData);
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    console.log(`[${new Date().toISOString()}] API Success - Tokens: ${data.usage?.input_tokens + data.usage?.output_tokens}`);
    
    res.json(data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Server Error:`, error.message);
    res.status(500).json({ 
      error: { 
        message: error.message,
        type: 'server_error'
      } 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Medical Assistant Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 API Proxy: http://0.0.0.0:${PORT}/api/claude`);
  console.log(`🏥 Frontend: http://0.0.0.0:${PORT}`);
});
