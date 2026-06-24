const ADMIN_PASSWORD = "0827";

let studyTimer = null;
let studyIndex = 0;
let currentStudyWords = [];
let currentAnswer = null;

let quizQueue = [];
let quizIndex = 0;
let quizMode = "";
let quizWords = [];

let lessonsCache = [];

// Firebase 준비 확인
function waitForFirebase() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (window.firebaseDB) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}

// Firestore에서 차시 불러오기
async function getLessons() {
  const {
    db,
    collection,
    getDocs
  } = window.firebaseDB;

  const querySnapshot = await getDocs(collection(db, "lessons"));

  lessonsCache = [];

  querySnapshot.forEach(docItem => {
    lessonsCache.push({
      id: docItem.id,
      ...docItem.data()
    });
  });

  lessonsCache.sort((a, b) => {
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  return lessonsCache;
}

// Firestore에 차시 추가
async function addLessonToFirebase(lesson) {
  const {
    db,
    collection,
    addDoc
  } = window.firebaseDB;

  await addDoc(collection(db, "lessons"), lesson);
}

// Firestore에서 차시 삭제
async function deleteLessonFromFirebase(id) {
  const {
    db,
    deleteDoc,
    doc
  } = window.firebaseDB;

  await deleteDoc(doc(db, "lessons", id));
}

async function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  document.getElementById(pageId).classList.add("active");

  if (pageId !== "study") {
    stopStudy();
  }

  await refreshLessonSelects();
  await renderWordList();
}

function openAdmin() {
  const password = prompt("패스워드를 입력하세요");

  if (password === ADMIN_PASSWORD) {
    showPage("add");
  } else if (password !== null) {
    alert("비밀번호가 틀렸습니다.");
  }
}

function speak(word) {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  utterance.pitch = 1;

  speechSynthesis.speak(utterance);
}

async function addWords() {
  const lessonName = document.getElementById("lessonName").value.trim();
  const input = document.getElementById("wordInput").value.trim();

  if (!lessonName || !input) {
    alert("차시 이름과 단어를 입력하세요.");
    return;
  }

  const words = input.split("\n").map(line => {
    const [word, meaning] = line.split(",").map(item => item.trim());
    return { word, meaning };
  }).filter(item => item.word && item.meaning);

  if (words.length === 0) {
    alert("형식이 올바르지 않습니다. 예: apple, 사과");
    return;
  }

  await addLessonToFirebase({
    name: lessonName,
    words,
    createdAt: Date.now()
  });

  document.getElementById("lessonName").value = "";
  document.getElementById("wordInput").value = "";

  alert("저장되었습니다.");

  await refreshLessonSelects();
  await renderWordList();
}

async function refreshLessonSelects() {
  const lessons = await getLessons();

  const studySelect = document.getElementById("studyLesson");
  const quizSelect = document.getElementById("quizLesson");

  studySelect.innerHTML = "";
  quizSelect.innerHTML = "";

  if (lessons.length === 0) {
    const studyOption = document.createElement("option");
    studyOption.textContent = "저장된 차시가 없습니다";
    studyOption.value = "";

    const quizOption = document.createElement("option");
    quizOption.textContent = "저장된 차시가 없습니다";
    quizOption.value = "";

    studySelect.appendChild(studyOption);
    quizSelect.appendChild(quizOption);
    return;
  }

  lessons.forEach(lesson => {
    const option1 = document.createElement("option");
    option1.value = lesson.id;
    option1.textContent = lesson.name;

    const option2 = document.createElement("option");
    option2.value = lesson.id;
    option2.textContent = lesson.name;

    studySelect.appendChild(option1);
    quizSelect.appendChild(option2);
  });
}

async function startStudy() {
  stopStudy();

  const lessonId = document.getElementById("studyLesson").value;
  const lessons = await getLessons();
  const lesson = lessons.find(item => item.id === lessonId);

  if (!lesson) {
    alert("학습할 차시가 없습니다.");
    return;
  }

  currentStudyWords = lesson.words;
  studyIndex = 0;

  showStudyWord();

  studyTimer = setInterval(() => {
    studyIndex++;

    if (studyIndex >= currentStudyWords.length) {
      studyIndex = 0;
    }

    showStudyWord();
  }, 4000);
}

function showStudyWord() {
  const item = currentStudyWords[studyIndex];

  document.getElementById("studyWord").textContent = item.word;
  document.getElementById("studyMeaning").textContent = item.meaning;

  speak(item.word);
}

function stopStudy() {
  if (studyTimer) {
    clearInterval(studyTimer);
    studyTimer = null;
  }

  speechSynthesis.cancel();
}

async function startQuiz() {
  const lessonId = document.getElementById("quizLesson").value;
  quizMode = document.getElementById("quizMode").value;

  const lessons = await getLessons();
  const lesson = lessons.find(item => item.id === lessonId);

  if (!lesson || lesson.words.length < 4) {
    alert("퀴즈는 최소 4개 이상의 단어가 필요합니다.");
    return;
  }

  quizWords = lesson.words;
  quizQueue = [...quizWords].sort(() => Math.random() - 0.5);
  quizIndex = 0;

  showQuizQuestion();
}

function showQuizQuestion() {
  if (quizIndex >= quizQueue.length) {
    document.getElementById("quizQuestion").textContent = "🎉 퀴즈 완료";
    document.getElementById("quizOptions").innerHTML = "";
    document.getElementById("quizResult").textContent =
      `총 ${quizQueue.length}문제를 모두 학습했습니다.`;
    return;
  }

  currentAnswer = quizQueue[quizIndex];

  let questionText = "";

  if (quizMode === "soundToWord") {
    questionText =
      `문제 ${quizIndex + 1}/${quizQueue.length} - 소리를 듣고 단어를 선택하세요`;
    speak(currentAnswer.word);
  }

  if (quizMode === "meaningToWord") {
    questionText =
      `문제 ${quizIndex + 1}/${quizQueue.length} - ${currentAnswer.meaning}`;
  }

  if (quizMode === "wordToMeaning") {
    questionText =
      `문제 ${quizIndex + 1}/${quizQueue.length} - ${currentAnswer.word}`;
    speak(currentAnswer.word);
  }

  document.getElementById("quizQuestion").textContent = questionText;
  document.getElementById("quizResult").textContent = "";

  const options = makeOptions(quizWords, currentAnswer, quizMode);
  renderOptions(options, quizMode);
}

function makeOptions(words, answer, mode) {
  const shuffled = [...words].sort(() => Math.random() - 0.5);

  const wrongOptions = shuffled
    .filter(item => item.word !== answer.word)
    .slice(0, 3);

  return [...wrongOptions, answer].sort(() => Math.random() - 0.5);
}

function renderOptions(options, mode) {
  const box = document.getElementById("quizOptions");
  box.innerHTML = "";

  options.forEach(option => {
    const button = document.createElement("button");
    button.className = "option";

    if (mode === "wordToMeaning") {
      button.textContent = option.meaning;
    } else {
      button.textContent = option.word;
    }

    button.onclick = () => checkAnswer(option);

    box.appendChild(button);
  });
}

function checkAnswer(selected) {
  const result = document.getElementById("quizResult");

  if (selected.word === currentAnswer.word) {
    result.textContent = "⭕ 정답";
    result.style.color = "blue";
  } else {
    result.textContent = "❌ 오답 - 나중에 다시 출제됩니다.";
    result.style.color = "red";

    quizQueue.push(currentAnswer);
  }

  quizIndex++;

  setTimeout(() => {
    showQuizQuestion();
  }, 1000);
}

async function renderWordList() {
  const lessons = await getLessons();
  const box = document.getElementById("wordList");

  box.innerHTML = "";

  if (lessons.length === 0) {
    box.innerHTML = "<p>저장된 단어장이 없습니다.</p>";
    return;
  }

  lessons.forEach(lesson => {
    const div = document.createElement("div");
    div.className = "card";

    const wordTexts = lesson.words
      .map(item => `${item.word} - ${item.meaning}`)
      .join("<br>");

    div.innerHTML = `
      <h3>${lesson.name}</h3>
      <p>${wordTexts}</p>
      <button onclick="deleteLesson('${lesson.id}')">삭제</button>
    `;

    box.appendChild(div);
  });
}

async function deleteLesson(id) {
  if (!confirm("이 차시를 삭제할까요?")) return;

  await deleteLessonFromFirebase(id);

  await refreshLessonSelects();
  await renderWordList();
}

async function initApp() {
  await waitForFirebase();
  await refreshLessonSelects();
  await renderWordList();
}

initApp();