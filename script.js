const ROLE_CONFIG = {
  admin: {
    badge: "관리자 로그인",
    submitLabel: "관리자 화면으로 이동",
  },
  student: {
    badge: "학생 코드 로그인",
    submitLabel: "학생 질문지로 이동",
  },
  teacher: {
    badge: "강사 코드 로그인",
    submitLabel: "강사 화면으로 이동",
  },
};

function sanitizeCode(rawValue) {
  return rawValue.replace(/\D/g, "").slice(0, 8);
}

function updateUrlRole(role) {
  const url = new URL(window.location.href);
  url.searchParams.set("role", role);
  window.history.replaceState({}, "", url);
}

function setActiveRole(role) {
  document.body.dataset.role = role;

  const tabs = document.querySelectorAll(".role-tab");
  const panels = document.querySelectorAll("[data-role-panel]");

  tabs.forEach((tab) => {
    const isActive = tab.dataset.role === role;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.rolePanel === role;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  updateUrlRole(role);
}

function savePortalState(payload) {
  sessionStorage.setItem("afeAccessContext", JSON.stringify(payload));
}

function handleLandingPage() {
  const queryRole = new URLSearchParams(window.location.search).get("role");
  const initialRole = ["admin", "student", "teacher"].includes(queryRole)
    ? queryRole
    : "admin";

  setActiveRole(initialRole);

  document.querySelectorAll(".role-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveRole(tab.dataset.role);
    });
  });

  document.querySelectorAll("input[inputmode='numeric']").forEach((input) => {
    input.addEventListener("input", (event) => {
      event.currentTarget.value = sanitizeCode(event.currentTarget.value);
    });
  });

  document.querySelectorAll("[data-entry-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const role = form.dataset.entryForm;
      const formData = new FormData(form);

      if (role === "admin") {
        const adminId = String(formData.get("adminId") || "").trim();
        const adminPassword = String(formData.get("adminPassword") || "").trim();

        if (!adminId || !adminPassword) {
          window.alert("관리자 ID와 비밀번호를 모두 입력해주세요.");
          return;
        }

        savePortalState({
          role,
          label: "관리자",
          identifierLabel: "입력한 ID",
          identifierValue: adminId,
        });
      } else {
        const codeKey = role === "student" ? "studentCode" : "teacherCode";
        const code = sanitizeCode(String(formData.get(codeKey) || "").trim());

        if (code.length !== 8) {
          window.alert("코드는 8자리 숫자로 입력해주세요.");
          return;
        }

        savePortalState({
          role,
          label: role === "student" ? "학생" : "강사",
          identifierLabel: "입력한 코드",
          identifierValue: code,
        });
      }

      window.location.href = "./portal.html";
    });
  });
}

function handlePortalPage() {
  const rawData = sessionStorage.getItem("afeAccessContext");
  const parsed = rawData ? JSON.parse(rawData) : null;
  const role = parsed?.role || "admin";

  document.body.dataset.role = role;

  const roleName = document.querySelector("[data-role-name]");
  const identifierLabel = document.querySelector("[data-identifier-label]");
  const identifierValue = document.querySelector("[data-identifier-value]");
  const guidanceTitle = document.querySelector("[data-guidance-title]");
  const guidanceList = document.querySelector("[data-guidance-list]");

  const messages = {
    admin: {
      title: "관리자 페이지 구현 예정 항목",
      items: [
        "프로그램 개설과 8자리 코드 자동 발급",
        "교급, 학교명, 연도, 학기, 강사 배정 관리",
        "최종 결과 확인 및 Excel 다운로드",
      ],
    },
    student: {
      title: "학생 페이지 구현 예정 항목",
      items: [
        "학번, 이름, 희망전공 입력",
        "프로그램 유형별 동적 질문지 표시",
        "제출 후 강사 검토 단계로 전달",
      ],
    },
    teacher: {
      title: "강사 페이지 구현 예정 항목",
      items: [
        "배정된 프로그램 목록 표시",
        "학생 응답 확인 및 평가 입력",
        "최종 제출 후 관리자 검토 단계로 전달",
      ],
    },
  };

  roleName.textContent = parsed?.label || ROLE_CONFIG[role].badge;
  identifierLabel.textContent = parsed?.identifierLabel || "입력값";
  identifierValue.textContent = parsed?.identifierValue || "없음";
  guidanceTitle.textContent = messages[role].title;
  guidanceList.innerHTML = messages[role].items
    .map((item) => `<li>${item}</li>`)
    .join("");
}

if (document.body.dataset.page === "landing") {
  handleLandingPage();
}

if (document.body.dataset.page === "portal") {
  handlePortalPage();
}
