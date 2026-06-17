import React from "react";

const UI_FONT =
  'Inter, Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif';

export default function AboutPage() {
  return (
    <div style={styles.page}>
      <img
        src="/about-hero.png"
        alt="toy-chat overview"
        style={styles.image}
      />
    </div>
  );
}

const styles = {
  page: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    padding: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    background: "transparent",
    fontFamily: UI_FONT,
  },

  image: {
    width: "100%",
    height: "auto",
    display: "block",
    userSelect: "none",
    pointerEvents: "none",
  },
};