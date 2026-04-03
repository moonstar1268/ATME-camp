document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-tabs]").forEach((tabsRoot) => {
    const buttons = tabsRoot.querySelectorAll("[data-tab-target]");
    const panels = tabsRoot.querySelectorAll("[data-tab-panel]");

    const activate = (name) => {
      buttons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tabTarget === name);
      });
      panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.tabPanel === name);
      });
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.tabTarget));
    });
  });

  document.querySelectorAll("input[name='program_code']").forEach((input) => {
    input.addEventListener("input", (event) => {
      event.currentTarget.value = event.currentTarget.value
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 12);
    });
  });

  document.querySelectorAll("[data-teacher-lookup]").forEach((input) => {
    const hiddenInput = input.form?.querySelector("[data-teacher-id]");
    const dataListId = input.getAttribute("list");
    const dataList = dataListId ? document.getElementById(dataListId) : null;

    const syncTeacher = () => {
      if (!hiddenInput || !dataList) {
        return;
      }
      const matchedOption = Array.from(dataList.querySelectorAll("option")).find(
        (option) => option.value === input.value,
      );
      hiddenInput.value = matchedOption?.dataset.id || "";
    };

    input.addEventListener("change", syncTeacher);
    input.addEventListener("input", syncTeacher);
    input.form?.addEventListener("submit", syncTeacher);
  });

  const templateLockModal = document.querySelector("[data-template-lock-modal]");
  if (templateLockModal) {
    const templateNameTarget = templateLockModal.querySelector("[data-template-lock-name]");
    const closeTemplateLockModal = () => {
      templateLockModal.hidden = true;
    };

    document.querySelectorAll("[data-template-lock-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        if (templateNameTarget) {
          templateNameTarget.textContent = button.dataset.templateName || "Selected";
        }
        templateLockModal.hidden = false;
      });
    });

    templateLockModal.querySelectorAll("[data-template-lock-close]").forEach((button) => {
      button.addEventListener("click", closeTemplateLockModal);
    });

    templateLockModal.addEventListener("click", (event) => {
      if (event.target === templateLockModal) {
        closeTemplateLockModal();
      }
    });
  }

  document.querySelectorAll("[data-program-delete-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitButton = form.querySelector("button[type='submit']");
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (!response.ok) {
          throw new Error("Delete failed");
        }

        window.location.reload();
      } catch (error) {
        if (submitButton) {
          submitButton.disabled = false;
        }
        window.alert("프로그램 삭제 중 오류가 발생했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      }
    });
  });

  document.querySelectorAll("[data-copy-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = document.getElementById(button.dataset.copySource);
      const target = document.getElementById(button.dataset.copyTarget);
      if (!source || !target) {
        return;
      }
      target.value = source.textContent.trim();
      target.focus();
    });
  });
});
