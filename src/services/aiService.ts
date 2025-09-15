export interface AIResponse {
	solution: string;
	steps: string[];
	confidence: number;
	error?: string;
}

export async function solveMathProblem(question: string): Promise<AIResponse> {
	try {
		const GROQ_PROXY_URL = 'http://localhost:3001/api/groq-chat';
		const messages = [
			{ role: "system", content: "You are MathMentor, a super-smart, friendly, and fun math assistant inside the Numinix app. Follow the same rules and style as before." },
			{ role: "user", content: question }
		];
		const response = await fetch(GROQ_PROXY_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "openai/gpt-oss-20b",
				messages
			})
		});
		if (!response.ok) {
			let errorText = await response.text();
			console.error('Groq API error:', response.status, response.statusText, errorText);
			throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
		}
		const data = await response.json();
		return {
			solution: data.choices?.[0]?.message?.content || "",
			steps: [],
			confidence: 1,
			error: undefined
		};
	} catch (error: any) {
		return {
			solution: '',
			steps: [],
			confidence: 0,
			error: error.message
		};
	}
}

// Personalized AI quiz question generator
export async function generateQuestions(userProfile: any, selectedChapters: string[]): Promise<any[]> {
	try {
		const GROQ_PROXY_URL = 'http://localhost:3001/api/groq-chat';
		const classLevel = userProfile.class_level;
		
		// Get chapter information
		const chaptersData = await import('../data/chapters.json');
		const selectedChapterInfo = selectedChapters.map(chapterId => 
			chaptersData.default.find((ch: any) => ch.id === chapterId)
		).filter(Boolean);
		
		const chapterNames = selectedChapterInfo.map(ch => ch?.chapter).join(', ');
		const chapterTopics = selectedChapterInfo.flatMap(ch => ch?.topics || []);
		
		// Get user's performance data for personalization
		const { ProgressTrackingService } = await import('./progressTrackingService');
		const analytics = await ProgressTrackingService.getUserAnalytics(userProfile.id);
		
		const strengths = analytics?.analytics?.conceptsMastered > 0 ? ['Problem Solving'] : [];
		const weaknesses = analytics?.analytics?.accuracy < 70 ? ['Basic Concepts'] : [];
		const unlockedChapters = userProfile.unlocked_chapters || [];
		
		let prompt = `You are a math quiz generator for class ${classLevel} student. Create questions ONLY from the selected chapters and their specific topics.

IMPORTANT: Only create mathematics questions. Do NOT include any science, physics, chemistry, or biology content. Focus strictly on math.

Selected Chapters: ${chapterNames}
Chapter Topics to Focus On: ${chapterTopics.join(', ')}
Student Class Level: ${classLevel}
Student Strengths: ${strengths.join(', ') || 'Building foundation'}
Student Weaknesses: ${weaknesses.join(', ') || 'None identified'}
Student Accuracy: ${analytics?.analytics?.accuracy?.toFixed(1) || 0}%

CRITICAL: Questions must be from these specific topics only: ${chapterTopics.join(', ')}
		
Return ONLY a valid JSON array with this exact structure:
[
  { "id": "q1", "question": "Question about ${chapterTopics[0] || 'selected topic'}", "options": ["option1", "option2", "option3", "option4"], "correct_answer": "option1", "explanation": "Clear explanation", "difficulty": "easy", "class_level": ${classLevel}, "topic": "${chapterTopics[0] || 'selected topic'}" }
]

Requirements:
- Exactly 10 questions
- Questions ONLY from these topics: ${chapterTopics.join(', ')}
- Questions appropriate for class ${classLevel} 
- Mix of difficulties: ${analytics?.analytics?.accuracy > 80 ? '3 easy, 4 medium, 3 hard' : analytics?.analytics?.accuracy > 60 ? '4 easy, 4 medium, 2 hard' : '6 easy, 3 medium, 1 hard'}
- Personalize based on user's ${analytics?.analytics?.accuracy?.toFixed(1) || 0}% accuracy
- Each question must have exactly 4 options
- Clear explanations
- Questions must be from selected chapters: ${chapterNames}
- Valid JSON format only, no extra text`;

		const messages = [
			{ role: "system", content: prompt },
			{ role: "user", content: `Generate 10 personalized math quiz questions for class ${classLevel}.` }
		];
		
		const response = await fetch(GROQ_PROXY_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "openai/gpt-oss-20b",
				messages
			})
		});
		if (!response.ok) {
			throw new Error(`Groq API error: ${response.statusText}`);
		}
		const data = await response.json();
		console.log('AI raw Groq response:', data);
		let rawText = data.choices?.[0]?.message?.content?.trim() || '';
		console.log('AI rawText before cleanup:', rawText);
		// Clean up the response - remove markdown formatting
		rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
		console.log('AI rawText after cleanup:', rawText);
		// Try to find JSON array in the response
		const jsonMatch = rawText.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			rawText = jsonMatch[0];
			console.log('AI extracted JSON array:', rawText);
		}
		let generatedQuestions: any[] = [];
		try {
			generatedQuestions = JSON.parse(rawText);
			if (!Array.isArray(generatedQuestions)) {
				throw new Error('Response is not an array');
			}
			generatedQuestions = generatedQuestions.filter(q => 
				q.id && q.question && q.options && Array.isArray(q.options) && 
				q.correct_answer && q.explanation && q.difficulty && q.topic
			);
			if (generatedQuestions.length === 0) {
				throw new Error('No valid questions generated');
			}
			generatedQuestions = generatedQuestions.slice(0, 10);
		} catch (parseError) {
			console.error('JSON Parse Error:', parseError);
			console.error('Raw text:', rawText);
			throw new Error(`Failed to parse AI response: ${parseError}`);
		}
		return generatedQuestions;
	} catch (error: any) {
		console.error('AI Question Generation Error:', error);
		// Return fallback questions specific to selected chapters
		const chaptersData = await import('../data/chapters.json');
		const selectedChapterInfo = selectedChapters.map(chapterId => 
			chaptersData.default.find((ch: any) => ch.id === chapterId)
		).filter(Boolean);
		
		const firstChapter = selectedChapterInfo[0];
		const chapterName = firstChapter?.chapter || 'Mathematics';
		const firstTopic = firstChapter?.topics?.[0] || 'Basic Concepts';
		
		return [
			{
				id: "fallback_1",
				question: `This is a practice question for ${chapterName}. What is 5 + 3?`,
				options: ["6", "7", "8", "9"],
				correct_answer: "8",
				explanation: "5 + 3 = 8. This is a basic addition problem.",
				difficulty: "easy",
				class_level: userProfile.class_level,
				topic: firstTopic
			},
			{
				id: "fallback_2", 
				question: `In ${chapterName}, if x + 4 = 10, what is x?`,
				options: ["4", "5", "6", "7"],
				correct_answer: "6",
				explanation: "To find x, we subtract 4 from both sides: x = 10 - 4 = 6.",
				difficulty: "medium",
				class_level: userProfile.class_level,
				topic: firstTopic
			},
			{
				id: "fallback_3",
				question: `Practice problem for ${chapterName}: What is 2 × 4?`,
				options: ["6", "7", "8", "9"],
				correct_answer: "8",
				explanation: "2 × 4 = 8. This is basic multiplication.",
				difficulty: "easy",
				class_level: userProfile.class_level,
				topic: firstTopic
			}
		];
	}
}