window.winLayer = (function(){
    const gameWin = document.getElementById("gameWinImg");
    const matchWin = document.getElementById("matchWinImg");
    const matchOver = document.getElementById("matchOverImg");
    const winnerText = document.getElementById("winnerText");

    function log(...msg){ console.log("[WINLAYER]", ...msg); }

    function resetAll(){
        [gameWin, matchWin, matchOver, winnerText].forEach(el => {
            if(el) el.classList.remove("show");
        });
    }

    function handleEvent(event, name1, name2){
        resetAll();

        if(!event || !event.type) return;

        const playerName = event.player === 1 ? name1 : name2;
        log("handleEvent triggered:", event);

        if(event.type === "gameWin" && gameWin){
            gameWin.classList.add("show");
            gameWin.style.left = event.player === 1 ? "412px" : "1048px";
            gameWin.style.top = event.player === 1 ? "34px" : "137px";

            setTimeout(() => {
                resetAll();
                log("GameWin cleared");
            }, 3000);
        }

        if(event.type === "matchWin" && matchWin){
            matchWin.classList.add("show");
            matchWin.style.left = event.player === 1 ? "412px" : "1048px";
            matchWin.style.top = event.player === 1 ? "34px" : "137px";

            setTimeout(() => {
                if(matchOver) matchOver.classList.add("show");
                if(matchOver) { matchOver.style.left = "610px"; matchOver.style.top = "330px"; }

                if(winnerText){
                    winnerText.innerText = playerName + " wins the match!";
                    winnerText.classList.add("show");
                }

                setTimeout(() => {
                    resetAll();
                    log("MatchWin cleared");
                }, 10000);

            }, 5000);
        }
    }

    return { handleEvent };
})();