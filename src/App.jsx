import React, { useState, useEffect } from 'react';
import { Upload, FileText, Settings, Bug, AlertCircle, CheckCircle, XCircle, Loader, X, MessageSquare, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

const SYSTEM_PROMPT = `From now on, act as my expert assistant with access to all your reasoning and knowledge. Always provide:

⚠️ DISCLAIMER: I am an AI agent and not a medical professional. The information I provide should NOT be taken as medical advice. I am only providing information available on the public internet learned by an LLM. I am not responsible for any of the content provided. Always consult with qualified healthcare professionals for medical advice.

1. A clear, direct answer to your request.
2. A step-by-step explanation of how I got there.
3. Alternative perspectives or solutions you might not have thought of.
4. A practical summary or action plan you can apply immediately.

I never give vague answers. If the question is broad, I break it into parts. I act like a professional in the relevant domain and push my reasoning to 100% of my capacity.`;

// Determine API endpoint based on environment
const API_ENDPOINT = process.env.NODE_ENV === 'production' || window.location.hostname !== 'localhost'
  ? '/api/claude'  // Use backend proxy in Docker
  : '/api/claude'; // Also use proxy in development

export default function MedicalAssistant() {
  const [activeTab, setActiveTab] = useState('upload');
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [pdfText, setPdfText] = useState('');
  const [manualText, setManualText] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [extractedSymptoms, setExtractedSymptoms] = useState([]);
  const [confirmedSymptoms, setConfirmedSymptoms] = useState([]);
  const [additionalSymptoms, setAdditionalSymptoms] = useState('');
  const [potentialCauses, setPotentialCauses] = useState(null);
  const [solutions, setSolutions] = useState(null);
  const [activeChatSource, setActiveChatSource] = useState(null);
  const [chatMessages, setChatMessages] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [expandedSources, setExpandedSources] = useState({});

  useEffect(() => {
    const stored = localStorage.getItem('claude_api_key');
    if (stored) {
      setApiKey(stored);
      addDebugLog('API Key loaded from storage', 'success');
    } else {
      setShowApiKeyInput(true);
      addDebugLog('No API Key found - please enter one', 'warning');
    }
  }, []);

  const addDebugLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const saveApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem('claude_api_key', tempApiKey.trim());
      setApiKey(tempApiKey.trim());
      setShowApiKeyInput(false);
      addDebugLog('API Key saved successfully', 'success');
    }
  };

  const callClaude = async (prompt, context = '') => {
    if (!apiKey) {
      addDebugLog('Error: No API Key configured', 'error');
      throw new Error('Please configure your Claude API key first');
    }

    addDebugLog('Making API call via proxy...', 'info');
    
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKey,
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: context ? `${context}\n\n${prompt}` : prompt
          }]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        addDebugLog(`API Error: ${error.error?.message || 'Unknown error'}`, 'error');
        throw new Error(error.error?.message || 'API request failed');
      }

      const data = await response.json();
      addDebugLog(`API call successful. Tokens used: ${data.usage?.input_tokens + data.usage?.output_tokens}`, 'success');
      
      return data.content[0].text;
    } catch (error) {
      addDebugLog(`Exception: ${error.message}`, 'error');
      throw error;
    }
  };

  const extractTextFromPDF = async (file) => {
    addDebugLog('Extracting text from PDF...', 'info');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = await callClaude(
            'Extract all medical information, test results, diagnoses, and relevant data from this document. Present it in a clear, structured format.',
            `PDF Content (base64): ${e.target.result.split(',')[1].substring(0, 1000)}...`
          );
          addDebugLog('Text extracted from PDF', 'success');
          resolve(text);
        } catch (error) {
          addDebugLog('Failed to extract text from PDF', 'error');
          reject(error);
        }
      };
      reader.onerror = () => {
        addDebugLog('File reading error', 'error');
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      addDebugLog('Invalid file type - PDF required', 'error');
      alert('Please upload a PDF file');
      return;
    }

    setLoading(true);
    try {
      const text = await extractTextFromPDF(file);
      setPdfText(text);
      setActiveTab('symptoms');
    } catch (error) {
      alert('Failed to process PDF: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzeSymptoms = async () => {
    const medicalData = pdfText || manualText;
    if (!medicalData.trim()) {
      alert('Please provide medical data first');
      return;
    }

    setLoading(true);
    addDebugLog('Analyzing medical data for symptoms...', 'info');
    
    try {
      const response = await callClaude(
        'Analyze this medical data and extract all symptoms, abnormal findings, and concerning indicators. Return ONLY a JSON array of symptoms with this exact format: [{"symptom": "symptom name", "severity": "mild|moderate|severe", "source": "where it was found"}]. No other text.',
        `Medical Data:\n${medicalData}`
      );

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const symptoms = JSON.parse(jsonMatch[0]);
        setExtractedSymptoms(symptoms);
        addDebugLog(`Extracted ${symptoms.length} symptoms`, 'success');
      } else {
        throw new Error('Could not parse symptoms from response');
      }
    } catch (error) {
      alert('Failed to analyze symptoms: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSymptom = (symptom) => {
    setConfirmedSymptoms(prev => {
      const exists = prev.find(s => s.symptom === symptom.symptom);
      if (exists) {
        return prev.filter(s => s.symptom !== symptom.symptom);
      } else {
        return [...prev, symptom];
      }
    });
  };

  const analyzeCauses = async () => {
    if (confirmedSymptoms.length === 0 && !additionalSymptoms.trim()) {
      alert('Please confirm at least one symptom or add additional symptoms');
      return;
    }

    setLoading(true);
    addDebugLog('Analyzing potential causes...', 'info');

    const allSymptoms = [
      ...confirmedSymptoms.map(s => s.symptom),
      ...additionalSymptoms.split(',').map(s => s.trim()).filter(Boolean)
    ];

    try {
      const response = await callClaude(
        `Analyze these symptoms and provide potential medical causes/conditions. Format as JSON: {"causes": [{"condition": "name", "probability": "high|medium|low", "explanation": "why", "urgency": "immediate|soon|routine"}]}`,
        `Symptoms: ${allSymptoms.join(', ')}`
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setPotentialCauses(data);
        addDebugLog(`Identified ${data.causes?.length || 0} potential causes`, 'success');
        setActiveTab('causes');
      }
    } catch (error) {
      alert('Failed to analyze causes: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const findSolutions = async () => {
    if (!potentialCauses) {
      alert('Please analyze causes first');
      return;
    }

    setLoading(true);
    addDebugLog('Searching for treatment solutions...', 'info');

    try {
      const response = await callClaude(
        `For these conditions, provide treatment approaches in Ayurvedic, Homeopathic, Allopathic, and Naturopathic medicine. Include reputable sources. Format as JSON: {"solutions": [{"category": "Ayurvedic|Homeopathic|Allopathic|Naturopathic", "treatments": [{"name": "treatment", "description": "how it works", "source": "source name", "url": "URL", "recommendedQuestions": ["q1", "q2"]}]}]}`,
        `Conditions: ${potentialCauses.causes.map(c => c.condition).join(', ')}`
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setSolutions(data);
        addDebugLog(`Found solutions across ${data.solutions?.length || 0} categories`, 'success');
        setActiveTab('solutions');
      }
    } catch (error) {
      alert('Failed to find solutions: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const startChat = (source) => {
    setActiveChatSource(source);
    if (!chatMessages[source.name]) {
      setChatMessages(prev => ({
        ...prev,
        [source.name]: []
      }));
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeChatSource) return;

    const userMessage = chatInput;
    setChatInput('');

    setChatMessages(prev => ({
      ...prev,
      [activeChatSource.name]: [
        ...(prev[activeChatSource.name] || []),
        { role: 'user', content: userMessage }
      ]
    }));

    addDebugLog(`Chat query sent for ${activeChatSource.name}`, 'info');

    try {
      const response = await callClaude(
        userMessage,
        `Source: ${activeChatSource.name}\nDescription: ${activeChatSource.description}\nURL: ${activeChatSource.url}`
      );

      setChatMessages(prev => ({
        ...prev,
        [activeChatSource.name]: [
          ...(prev[activeChatSource.name] || []),
          { role: 'assistant', content: response }
        ]
      }));

      addDebugLog('Chat response received', 'success');
    } catch (error) {
      alert('Chat failed: ' + error.message);
    }
  };

  const renderUploadTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4">Upload Medical Document</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Upload a PDF of your medical report</p>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-indigo-700 transition-colors inline-block"
          >
            Choose PDF File
          </label>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">OR</span>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Paste Medical Text</h2>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Paste your medical report, blood test results, or doctor's notes here..."
          className="w-full h-64 px-4 py-3 border rounded-lg resize-none"
        />
      </div>

      {(pdfText || manualText) && (
        <button
          onClick={analyzeSymptoms}
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Analyze Medical Data'
          )}
        </button>
      )}
    </div>
  );

  const renderSymptomsTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4">Extracted Symptoms</h2>
        {extractedSymptoms.length === 0 ? (
          <p className="text-gray-600">No symptoms extracted yet. Please analyze your medical data first.</p>
        ) : (
          <div className="space-y-3">
            {extractedSymptoms.map((symptom, idx) => (
              <div
                key={idx}
                onClick={() => toggleSymptom(symptom)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  confirmedSymptoms.find(s => s.symptom === symptom.symptom)
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold">{symptom.symptom}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        symptom.severity === 'severe' ? 'bg-red-100 text-red-800' :
                        symptom.severity === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {symptom.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Source: {symptom.source}</p>
                  </div>
                  {confirmedSymptoms.find(s => s.symptom === symptom.symptom) ? (
                    <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex-shrink-0"></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Additional Symptoms</h2>
        <textarea
          value={additionalSymptoms}
          onChange={(e) => setAdditionalSymptoms(e.target.value)}
          placeholder="Enter any additional symptoms you're experiencing (comma-separated)..."
          className="w-full h-32 px-4 py-3 border rounded-lg resize-none"
        />
      </div>

      <button
        onClick={analyzeCauses}
        disabled={loading || (confirmedSymptoms.length === 0 && !additionalSymptoms.trim())}
        className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 flex items-center justify-center"
      >
        {loading ? (
          <>
            <Loader className="w-5 h-5 mr-2 animate-spin" />
            Analyzing...
          </>
        ) : (
          'Find Potential Causes'
        )}
      </button>
    </div>
  );

  const renderCausesTab = () => (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
        <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-yellow-800">Medical Disclaimer</h3>
          <p className="text-sm text-yellow-700 mt-1">
            This information is AI-generated and NOT a substitute for professional medical advice. 
            Always consult qualified healthcare providers for proper diagnosis and treatment.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-bold">Potential Causes</h2>
      
      {!potentialCauses ? (
        <p className="text-gray-600">No analysis available yet. Please analyze symptoms first.</p>
      ) : (
        <div className="space-y-4">
          {potentialCauses.causes?.map((cause, idx) => (
            <div key={idx} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">{cause.condition}</h3>
                <div className="flex space-x-2">
                  <span className={`px-3 py-1 text-sm rounded-full ${
                    cause.probability === 'high' ? 'bg-red-100 text-red-800' :
                    cause.probability === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {cause.probability} probability
                  </span>
                  <span className={`px-3 py-1 text-sm rounded-full ${
                    cause.urgency === 'immediate' ? 'bg-red-100 text-red-800' :
                    cause.urgency === 'soon' ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {cause.urgency}
                  </span>
                </div>
              </div>
              <p className="text-gray-700">{cause.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {potentialCauses && (
        <button
          onClick={findSolutions}
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 mr-2 animate-spin" />
              Finding Solutions...
            </>
          ) : (
            'Find Treatment Solutions'
          )}
        </button>
      )}
    </div>
  );

  const renderSolutionsTab = () => (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
        <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-yellow-800">Important Notice</h3>
          <p className="text-sm text-yellow-700 mt-1">
            This information is for educational purposes only and is NOT medical advice. 
            Treatment options shown are based on general information available on the internet.
            Always consult healthcare professionals before starting any treatment.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-bold">Treatment Solutions</h2>

      {!solutions ? (
        <p className="text-gray-600">No solutions available yet. Please analyze causes first.</p>
      ) : (
        <div className="space-y-6">
          {solutions.solutions?.map((category, idx) => (
            <div key={idx} className="border rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4 text-indigo-600">{category.category}</h3>
              <div className="space-y-4">
                {category.treatments?.map((treatment, tidx) => (
                  <div key={tidx} className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">{treatment.name}</h4>
                    <p className="text-gray-700 mb-3">{treatment.description}</p>
                    
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-sm font-medium text-gray-600">Source:</span>
                      <a
                        href={treatment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                      >
                        <span className="text-sm">{treatment.source}</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <div className="mb-3">
                      <button
                        onClick={() => setExpandedSources(prev => ({
                          ...prev,
                          [`${idx}-${tidx}`]: !prev[`${idx}-${tidx}`]
                        }))}
                        className="text-sm font-medium text-indigo-600 flex items-center space-x-1"
                      >
                        {expandedSources[`${idx}-${tidx}`] ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            <span>Hide Recommended Questions</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            <span>Show Recommended Questions</span>
                          </>
                        )}
                      </button>
                      
                      {expandedSources[`${idx}-${tidx}`] && (
                        <div className="mt-2 space-y-2">
                          {treatment.recommendedQuestions?.map((question, qidx) => (
                            <div key={qidx} className="bg-white p-2 rounded border text-sm">
                              {question}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => startChat(treatment)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Chat About This Treatment</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSettingsTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Claude API Key
        </label>
        <div className="flex space-x-2">
          <input
            type="password"
            value={tempApiKey}
            onChange={(e) => setTempApiKey(e.target.value)}
            placeholder={apiKey ? '••••••••••••••••' : 'Enter your Claude API key'}
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={saveApiKey}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Update
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Your API key is stored locally in your browser and sent only to our backend proxy server.
        </p>
      </div>

      <div className="border-t pt-6">
        <h3 className="font-semibold mb-3">API Key Status</h3>
        <div className="flex items-center space-x-2">
          {apiKey ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-700">API Key Configured</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700">No API Key Configured</span>
            </>
          )}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="font-semibold mb-3">About This Application</h3>
        <p className="text-gray-700 mb-2">
          This medical assistant application helps analyze medical documents and provides information 
          about potential symptoms, causes, and treatment options.
        </p>
        <p className="text-sm text-gray-600">
          Model: Claude Sonnet 4 (claude-sonnet-4-20250514)<br />
          API: Proxied through backend server (no CORS issues)
        </p>
      </div>
    </div>
  );

  const renderDebugTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Debug Logs</h2>
        <button
          onClick={() => setDebugLogs([])}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Clear Logs
        </button>
      </div>

      <div className="bg-gray-900 text-gray-100 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
        {debugLogs.length === 0 ? (
          <p className="text-gray-500">No debug logs yet...</p>
        ) : (
          debugLogs.map((log, idx) => (
            <div
              key={idx}
              className={`mb-2 ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-green-400' :
                log.type === 'warning' ? 'text-yellow-400' :
                'text-gray-300'
              }`}
            >
              <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
            </div>
          ))
        )}
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2">System Information</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">API Key Status:</span>
            <span className={apiKey ? 'text-green-600' : 'text-red-600'}>
              {apiKey ? 'Configured' : 'Not Configured'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total API Calls:</span>
            <span className="text-gray-900">
              {debugLogs.filter(log => log.message.includes('API call')).length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Errors:</span>
            <span className="text-gray-900">
              {debugLogs.filter(log => log.type === 'error').length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Model:</span>
            <span className="text-gray-900">claude-sonnet-4-20250514</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">API Endpoint:</span>
            <span className="text-gray-900">{API_ENDPOINT}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Medical Assistant</h1>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {showApiKeyInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Configure Claude API Key</h2>
            <p className="text-gray-600 mb-4">Please enter your Claude API key to use this application.</p>
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-4 py-2 border rounded-lg mb-4"
            />
            <button
              onClick={saveApiKey}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Save API Key
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md mb-6 overflow-x-auto">
          <div className="flex border-b min-w-max">
            {['upload', 'symptoms', 'causes', 'solutions', 'settings', 'debug'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab === 'upload' && <Upload className="w-5 h-5 inline mr-2" />}
                {tab === 'debug' && <Bug className="w-5 h-5 inline mr-2" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {activeTab === 'upload' && renderUploadTab()}
          {activeTab === 'symptoms' && renderSymptomsTab()}
          {activeTab === 'causes' && renderCausesTab()}
          {activeTab === 'solutions' && renderSolutionsTab()}
          {activeTab === 'settings' && renderSettingsTab()}
          {activeTab === 'debug' && renderDebugTab()}
        </div>
      </div>

      {activeChatSource && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">{activeChatSource.name}</h3>
              <button
                onClick={() => setActiveChatSource(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages[activeChatSource.name]?.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Ask a question about this treatment..."
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || loading}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
            <Loader className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-gray-700">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
