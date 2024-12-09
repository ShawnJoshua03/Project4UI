// scripts/health-education.js

document.addEventListener('DOMContentLoaded', () => {
    const articlesContainer = document.getElementById('articles-container');
  
    // Mock articles data
    const articles = [
      {
        title: 'Understanding Diabetes',
        summary: 'Learn about the causes, symptoms, and treatments for diabetes.',
        link: '#'
      },
      {
        title: '10 Tips for a Healthy Heart',
        summary: 'Discover lifestyle changes you can make to keep your heart healthy.',
        link: '#'
      },
      {
        title: 'Managing Stress Effectively',
        summary: 'Explore practical strategies to reduce and manage stress.',
        link: '#'
      },
      {
        title: 'Common Cold vs. Flu',
        summary: 'How to differentiate between a cold and the flu, and when to seek help.',
        link: '#'
      },
      {
        title: 'Understanding Mental Health',
        summary: 'Breaking the stigma around mental health and how to get support.',
        link: '#'
      },
      {
        title: 'Exercise for Beginners',
        summary: 'A beginner-friendly guide to incorporating exercise into your daily life.',
        link: '#'
      }
    ];
  
    // Populate articles dynamically
    articles.forEach(article => {
      const articleCard = document.createElement('div');
      articleCard.className = 'article-card';
      articleCard.innerHTML = `
        <h3>${article.title}</h3>
        <p>${article.summary}</p>
        <a href="${article.link}" target="_blank">Read More</a>
      `;
      articlesContainer.appendChild(articleCard);
    });
  });
  