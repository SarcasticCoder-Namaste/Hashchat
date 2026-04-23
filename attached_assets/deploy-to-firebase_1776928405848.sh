#!/bin/bash

# HashChat Firebase Deployment Script

echo "🚀 HashChat Firebase Deployment"
echo "================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Check if .firebaserc is configured
if grep -q "YOUR_FIREBASE_PROJECT_ID" .firebaserc; then
    echo "❌ Error: Update .firebaserc with your Firebase Project ID first"
    echo "   1. Go to https://console.firebase.google.com"
    echo "   2. Create a project"
    echo "   3. Get your Project ID from Project Settings"
    echo "   4. Replace YOUR_FIREBASE_PROJECT_ID in .firebaserc"
    exit 1
fi

# Build the app
echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

# Deploy to Firebase
echo "🌐 Deploying to Firebase..."
firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo "📍 Your app is now live on Firebase Hosting"
    echo "   Check https://console.firebase.google.com for your hosting URL"
else
    echo "❌ Deployment failed. Check the errors above."
    exit 1
fi
