import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WebsimSocket, useQuery } from '@websim/use-query';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const room = new WebsimSocket();

function AMAPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [creator, setCreator] = useState(null);
    const [newQuestion, setNewQuestion] = useState('');
    const [showComments, setShowComments] = useState(false);
    const [sortBy, setSortBy] = useState('votes'); // votes, newest, oldest

    const { data: questions, loading: questionsLoading } = useQuery(room.collection('questions'));
    const { data: votes, loading: votesLoading } = useQuery(room.collection('votes'));
    const { data: comments, loading: commentsLoading } = useQuery(
        room.query(`
            SELECT c.id, c.content, c.raw_content, c.created_at, c.user_id, c.reply_count,
                   u.username, u.avatar_url
            FROM public.comments c
            JOIN public.user u ON c.user_id = u.id
            WHERE c.parent_comment_id IS NULL
            ORDER BY c.created_at DESC
        `)
    );

    useEffect(() => {
        async function loadUserData() {
            const user = await window.websim.getCurrentUser();
            const creatorInfo = await window.websim.getCreator();
            setCurrentUser(user);
            setCreator(creatorInfo);
        }
        loadUserData();
    }, []);

    useEffect(() => {
        window.websim.addEventListener('comment:created', (data) => {
            // Comments will automatically update via useQuery
        });
    }, []);

    const isCreator = currentUser && creator && currentUser.id === creator.id;

    const submitQuestion = async (e) => {
        e.preventDefault();
        if (!newQuestion.trim() || !currentUser) return;

        try {
            await room.collection('questions').upsert({
                content: newQuestion.trim(),
                answer: null,
                user_id: currentUser.id
            });
            setNewQuestion('');
        } catch (error) {
            console.error('Error submitting question:', error);
        }
    };

    const submitAnswer = async (questionId, answer) => {
        if (!isCreator || !answer.trim()) return;

        try {
            await room.collection('questions').upsert({
                id: questionId,
                answer: answer.trim()
            });
        } catch (error) {
            console.error('Error submitting answer:', error);
        }
    };

    const vote = async (questionId, voteType) => {
        if (!currentUser) return;

        const voteId = `${currentUser.id}-${questionId}`;
        const existingVote = votes?.find(v => v.id === voteId);

        try {
            if (existingVote) {
                if (existingVote.vote_type === voteType) {
                    // Remove vote if clicking same button
                    await room.collection('votes').delete(voteId);
                } else {
                    // Change vote type
                    await room.collection('votes').upsert({
                        id: voteId,
                        question_id: questionId,
                        user_id: currentUser.id,
                        vote_type: voteType
                    });
                }
            } else {
                // New vote
                await room.collection('votes').upsert({
                    id: voteId,
                    question_id: questionId,
                    user_id: currentUser.id,
                    vote_type: voteType
                });
            }
        } catch (error) {
            console.error('Error voting:', error);
        }
    };

    const getVoteScore = (questionId) => {
        if (!votes) return 0;
        const questionVotes = votes.filter(v => v.question_id === questionId);
        const upvotes = questionVotes.filter(v => v.vote_type === 'up').length;
        const downvotes = questionVotes.filter(v => v.vote_type === 'down').length;
        return upvotes - downvotes;
    };

    const getUserVote = (questionId) => {
        if (!votes || !currentUser) return null;
        return votes.find(v => v.question_id === questionId && v.user_id === currentUser.id)?.vote_type || null;
    };

    const sortedQuestions = React.useMemo(() => {
        if (!questions) return [];
        
        const sorted = [...questions].sort((a, b) => {
            switch (sortBy) {
                case 'votes':
                    return getVoteScore(b.id) - getVoteScore(a.id);
                case 'newest':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                default:
                    return 0;
            }
        });
        
        return sorted;
    }, [questions, votes, sortBy]);

    const postComment = async (content) => {
        try {
            await window.websim.postComment({
                content: content
            });
        } catch (error) {
            console.error('Error posting comment:', error);
        }
    };

    if (!currentUser || !creator) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="flex items-center justify-center mb-4">
                    <img 
                        src={`https://images.websim.com/avatar/${creator.username}`}
                        alt={creator.username}
                        className="w-16 h-16 rounded-full border-4 border-indigo-200 mr-4"
                    />
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                            Ask Me Anything
                        </h1>
                        <p className="text-gray-600 mt-2">with @{creator.username}</p>
                    </div>
                </div>
                <p className="text-gray-700 max-w-2xl mx-auto">
                    Ask questions using the form below or the comment section. 
                    {isCreator ? " You can answer questions as the creator." : " Only the creator can provide answers."}
                </p>
            </div>

            {/* Question Form */}
            <div className="glass-effect rounded-2xl p-6 mb-8 fade-in">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">Ask a Question</h2>
                <form onSubmit={submitQuestion} className="space-y-4">
                    <textarea
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        placeholder="What would you like to know?"
                        className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        rows="3"
                        required
                    />
                    <button
                        type="submit"
                        disabled={!newQuestion.trim()}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed pulse-glow"
                    >
                        Submit Question
                    </button>
                </form>
            </div>

            {/* Sort Controls */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex space-x-2">
                    <button
                        onClick={() => setSortBy('votes')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            sortBy === 'votes' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Most Voted
                    </button>
                    <button
                        onClick={() => setSortBy('newest')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            sortBy === 'newest' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Newest
                    </button>
                    <button
                        onClick={() => setSortBy('oldest')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            sortBy === 'oldest' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Oldest
                    </button>
                </div>
                <button
                    onClick={() => setShowComments(!showComments)}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                    {showComments ? 'Hide' : 'Show'} Comments ({comments?.length || 0})
                </button>
            </div>

            {/* Questions */}
            <div className="space-y-6">
                {questionsLoading ? (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                    </div>
                ) : sortedQuestions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        No questions yet. Be the first to ask!
                    </div>
                ) : (
                    sortedQuestions.map((question) => (
                        <QuestionCard
                            key={question.id}
                            question={question}
                            voteScore={getVoteScore(question.id)}
                            userVote={getUserVote(question.id)}
                            onVote={vote}
                            onAnswer={submitAnswer}
                            isCreator={isCreator}
                            currentUser={currentUser}
                        />
                    ))
                )}
            </div>

            {/* Comments Section */}
            {showComments && (
                <div className="mt-12 glass-effect rounded-2xl p-6">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800">Comment Questions</h2>
                    
                    {/* Comment Form */}
                    <CommentForm onSubmit={postComment} />
                    
                    {/* Comments List */}
                    <div className="space-y-4 mt-6">
                        {commentsLoading ? (
                            <div className="text-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
                            </div>
                        ) : comments?.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">No comments yet.</p>
                        ) : (
                            comments?.map((comment) => (
                                <CommentCard key={comment.id} comment={comment} isCreator={isCreator} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function QuestionCard({ question, voteScore, userVote, onVote, onAnswer, isCreator, currentUser }) {
    const [showAnswerForm, setShowAnswerForm] = useState(false);
    const [answerText, setAnswerText] = useState('');

    const handleAnswerSubmit = (e) => {
        e.preventDefault();
        if (answerText.trim()) {
            onAnswer(question.id, answerText);
            setAnswerText('');
            setShowAnswerForm(false);
        }
    };

    return (
        <div className="question-card glass-effect rounded-xl p-6 fade-in">
            <div className="flex items-start space-x-4">
                {/* Vote buttons */}
                <div className="flex flex-col items-center space-y-1">
                    <button
                        onClick={() => onVote(question.id, 'up')}
                        className={`vote-button p-2 rounded-full transition-colors ${
                            userVote === 'up' 
                                ? 'bg-green-500 text-white active' 
                                : 'bg-gray-200 text-gray-600 hover:bg-green-100'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <span className={`font-bold text-sm ${voteScore > 0 ? 'text-green-600' : voteScore < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {voteScore}
                    </span>
                    <button
                        onClick={() => onVote(question.id, 'down')}
                        className={`vote-button p-2 rounded-full transition-colors ${
                            userVote === 'down' 
                                ? 'bg-red-500 text-white active' 
                                : 'bg-gray-200 text-gray-600 hover:bg-red-100'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* Question content */}
                <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                        <img 
                            src={`https://images.websim.com/avatar/${question.username}`}
                            alt={question.username}
                            className="w-6 h-6 rounded-full"
                        />
                        <span className="font-medium text-sm text-gray-600">@{question.username}</span>
                        <span className="text-xs text-gray-400">
                            {new Date(question.created_at).toLocaleDateString()}
                        </span>
                    </div>
                    
                    <p className="text-gray-800 mb-4">{question.content}</p>

                    {/* Answer */}
                    {question.answer ? (
                        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-lg">
                            <div className="flex items-center space-x-2 mb-2">
                                <img 
                                    src={`https://images.websim.com/avatar/${creator.username}`}
                                    alt="Creator"
                                    className="w-5 h-5 rounded-full"
                                />
                                <span className="text-sm font-medium text-indigo-700">Answer:</span>
                            </div>
                            <p className="text-gray-800">{question.answer}</p>
                        </div>
                    ) : isCreator && (
                        <div className="mt-4">
                            {showAnswerForm ? (
                                <form onSubmit={handleAnswerSubmit} className="space-y-2">
                                    <textarea
                                        value={answerText}
                                        onChange={(e) => setAnswerText(e.target.value)}
                                        placeholder="Type your answer..."
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                        rows="3"
                                        required
                                    />
                                    <div className="flex space-x-2">
                                        <button
                                            type="submit"
                                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                        >
                                            Submit Answer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowAnswerForm(false)}
                                            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <button
                                    onClick={() => setShowAnswerForm(true)}
                                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors"
                                >
                                    Answer this question
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CommentForm({ onSubmit }) {
    const [comment, setComment] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (comment.trim()) {
            onSubmit(comment);
            setComment('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ask a question in the comments..."
                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                rows="3"
                required
            />
            <button
                type="submit"
                disabled={!comment.trim()}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2 rounded-xl font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Post Comment
            </button>
        </form>
    );
}

function CommentCard({ comment, isCreator }) {
    const commentHtml = React.useMemo(() => {
        if (comment.raw_content) {
            return DOMPurify.sanitize(marked.parse(comment.raw_content));
        }
        return '';
    }, [comment.raw_content]);

    return (
        <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-2 mb-3">
                <img 
                    src={comment.avatar_url || `https://images.websim.com/avatar/${comment.username}`}
                    alt={comment.username}
                    className="w-8 h-8 rounded-full"
                />
                <span className="font-medium text-gray-800">@{comment.username}</span>
                <span className="text-xs text-gray-500">
                    {new Date(comment.created_at).toLocaleDateString()}
                </span>
                {comment.reply_count > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        {comment.reply_count} replies
                    </span>
                )}
            </div>
            <div 
                className="comment-content text-gray-800"
                dangerouslySetInnerHTML={{ __html: commentHtml }}
            />
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<AMAPage />);

